import {describe, expect, it, test} from 'vitest'
import {Hono} from 'hono'
import {upgradeWebSocket} from '@hono/node-server'
import {os} from '@orpc/server'
import WebSocket from 'ws'
import {z} from 'zod'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {rpcWebsocketRoute, type UpgradeWebSocket} from '../src/rpc.js'
import {serveHono, type ServedHono} from '../src/serve.js'

const SHORT_DEADLINE_MS = 200
const UNREACHABLE_DEADLINE_MS = 30_000

function echoApp(): Hono {
  return new Hono().get(
    '/socket',
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        ws.send(`echo:${String(event.data)}`)
      },
    })),
  )
}

function serveEcho(options: {maxPayload?: number; gracefulCloseMs?: number} = {}): Promise<ServedHono> {
  return serveHono({
    fetch: echoApp().fetch,
    gracefulCloseMs: options.gracefulCloseMs ?? SHORT_DEADLINE_MS,
    ...(options.maxPayload === undefined ? {} : {maxPayload: options.maxPayload}),
  })
}

function connect(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/socket`)
}

function whenOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
}

function whenClosed(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)))
}

function roundTrip(socket: WebSocket, text: string): Promise<string> {
  const answered = new Promise<string>((resolve) => socket.once('message', (data) => resolve(String(data))))
  socket.send(text)
  return answered
}

test('a cooperative socket is closed with a going-away code without sitting out the deadline', async () => {
  const served = await serveEcho({gracefulCloseMs: UNREACHABLE_DEADLINE_MS})
  const socket = connect(served.port)
  await whenOpen(socket)
  expect(await roundTrip(socket, 'hi')).toBe('echo:hi')
  const closed = whenClosed(socket)
  await served.close()
  expect(await closed).toBe(1001)
}, 10_000)

test('a socket that never answers the close frame is terminated after the deadline', async () => {
  const served = await serveEcho()
  const socket = connect(served.port)
  await whenOpen(socket)
  expect(await roundTrip(socket, 'hi')).toBe('echo:hi')
  const closed = whenClosed(socket)
  socket.pause()
  await served.close()
  socket.resume()
  await closed
}, 20_000)

test('closing a server with no live sockets does not wait for the deadline', async () => {
  const served = await serveEcho({gracefulCloseMs: UNREACHABLE_DEADLINE_MS})
  const port = served.port
  await served.close()
  await expect(whenOpen(connect(port))).rejects.toThrow()
}, 10_000)

test('a frame above the configured maxPayload closes the socket instead of being echoed', async () => {
  const served = await serveEcho({maxPayload: 1024})
  const socket = connect(served.port)
  await whenOpen(socket)
  const closed = whenClosed(socket)
  socket.send('x'.repeat(4096))
  expect(await closed).toBe(1009)
  await served.close()
}, 20_000)

test('rejected upgrades leave no waiter behind for later clients', async () => {
  const served = await serveHono({
    fetch: new Hono()
      .use('/socket', async (c, next) => {
        if (c.req.header('x-probe-reject') === 'yes') return c.text('forbidden', 403)
        await next()
      })
      .route('/', echoApp()).fetch,
    gracefulCloseMs: SHORT_DEADLINE_MS,
  })
  for (const attempt of Array.from({length: 20}, (_value, index) => index)) {
    await new Promise<void>((resolve) => {
      const rejected = new WebSocket(`ws://127.0.0.1:${served.port}/socket`, {
        headers: {'x-probe-reject': 'yes', 'x-probe-attempt': String(attempt)},
      })
      rejected.once('open', () => {
        rejected.close()
        resolve()
      })
      rejected.once('error', () => resolve())
    })
  }
  const socket = connect(served.port)
  await whenOpen(socket)
  expect(await roundTrip(socket, 'still-here')).toBe('echo:still-here')
  await served.close()
}, 20_000)

test('a socket admitted while teardown is draining never blocks the close', async () => {
  const served = await serveEcho({gracefulCloseMs: 500})
  const early = connect(served.port)
  await whenOpen(early)
  const earlyClosed = whenClosed(early)
  early.pause()
  const closing = served.close()
  const late = connect(served.port)
  const lateSettled = new Promise<void>((resolve) => {
    late.once('close', () => resolve())
    late.once('error', () => resolve())
  })
  await closing
  early.resume()
  await earlyClosed
  await lateSettled
  expect(late.readyState).not.toBe(WebSocket.OPEN)
}, 20_000)

describe('rpc websocket route', () => {
  const router = {ping: os.input(z.object({value: z.string()})).handler(({input}) => ({pong: input.value}))}

  const strandedUpgrade: UpgradeWebSocket = () => () => Promise.resolve(new Response(null, {status: 500}))

  const adaptedUpgrade: UpgradeWebSocket = () => () => Promise.resolve(new Response())

  function upgradeRequest(): Request {
    return new Request(`http://127.0.0.1${RPC_WS_PATH}`, {
      headers: {upgrade: 'websocket', connection: 'Upgrade'},
    })
  }

  describe('the rpc websocket route refuses to fail silently', () => {
    it('reports a split @hono/node-server instance instead of closing the socket quietly', async () => {
      const reported: string[] = []
      const app = new Hono().get(
        RPC_WS_PATH,
        rpcWebsocketRoute(router, {upgrade: strandedUpgrade, onError: (message) => reported.push(message)}),
      )
      const response = await app.fetch(upgradeRequest())
      expect(response.status).toBe(500)
      expect(reported.join('\n')).toContain('different @hono/node-server module instance')
    })

    it('passes an upgrade the adapter accepted straight through', async () => {
      const reported: string[] = []
      const app = new Hono().get(
        RPC_WS_PATH,
        rpcWebsocketRoute(router, {upgrade: adaptedUpgrade, onError: (message) => reported.push(message)}),
      )
      const response = await app.fetch(upgradeRequest())
      expect(response.status).toBe(200)
      expect(reported).toEqual([])
    })

    it('leaves a plain request on the route alone', async () => {
      const app = new Hono().get(
        RPC_WS_PATH,
        rpcWebsocketRoute(router, {
          upgrade: () => () => Promise.resolve(new Response('not an upgrade', {status: 426})),
        }),
      )
      const response = await app.fetch(new Request(`http://127.0.0.1${RPC_WS_PATH}`))
      expect(response.status).toBe(426)
    })
  })
})
