import {expect, test} from 'vitest'
import {Hono} from 'hono'
import {upgradeWebSocket} from '@hono/node-server'
import type {ClientRequest} from 'node:http'
import WebSocket, {WebSocketServer} from 'ws'
import type {IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import {serveHono, type ClaimUpgrade, type ServedHono} from '../src/serve.js'

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

function claimPath(path: string, acceptor: WebSocketServer): ClaimUpgrade {
  return (req, socket, head) => {
    if (req.url !== path) return false
    acceptor.handleUpgrade(req, socket, head, (claimed) => claimed.send('claimed'))
    return true
  }
}

function firstMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => socket.once('message', (data) => resolve(String(data))))
}

function upgradeStatus(port: number, path: string): Promise<number> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`)
    socket.once('unexpected-response', (_request: ClientRequest, response: IncomingMessage) => {
      response.resume()
      socket.terminate()
      resolve(response.statusCode ?? 0)
    })
    socket.once('error', () => {})
  })
}

test('an unmatched upgrade with a claimer present still gets a 4xx from Hono', async () => {
  const acceptor = new WebSocketServer({noServer: true})
  const served = await serveHono({
    fetch: echoApp().fetch,
    gracefulCloseMs: SHORT_DEADLINE_MS,
    claimUpgrade: claimPath('/claimed', acceptor),
  })
  const status = await upgradeStatus(served.port, '/nowhere')
  expect(status).toBeGreaterThanOrEqual(400)
  expect(status).toBeLessThan(500)
  await served.close()
  acceptor.close()
}, 10_000)

test('a claimed upgrade skips Hono while Hono keeps its own sockets', async () => {
  const acceptor = new WebSocketServer({noServer: true})
  const honoSawClaimedPath = {value: false}
  const app = new Hono()
    .use('/claimed', async (_context, next) => {
      honoSawClaimedPath.value = true
      await next()
    })
    .route('/', echoApp())
  const served = await serveHono({
    fetch: app.fetch,
    gracefulCloseMs: SHORT_DEADLINE_MS,
    claimUpgrade: claimPath('/claimed', acceptor),
  })
  const claimed = new WebSocket(`ws://127.0.0.1:${served.port}/claimed`)
  expect(await firstMessage(claimed)).toBe('claimed')
  expect(honoSawClaimedPath.value).toBe(false)
  const socket = connect(served.port)
  await whenOpen(socket)
  expect(await roundTrip(socket, 'hi')).toBe('echo:hi')
  await served.close()
  acceptor.close()
}, 10_000)

test('a live claimed socket never holds the server open at close', async () => {
  const acceptor = new WebSocketServer({noServer: true})
  const served = await serveHono({
    fetch: echoApp().fetch,
    gracefulCloseMs: SHORT_DEADLINE_MS,
    claimUpgrade: claimPath('/claimed', acceptor),
  })
  const claimed = new WebSocket(`ws://127.0.0.1:${served.port}/claimed`)
  await firstMessage(claimed)
  const closed = whenClosed(claimed)
  await served.close()
  await closed
  acceptor.close()
}, 10_000)

test('a claimer that throws destroys that socket and leaves the server serving', async () => {
  const served = await serveHono({
    fetch: echoApp().fetch,
    gracefulCloseMs: SHORT_DEADLINE_MS,
    claimUpgrade: (req: IncomingMessage, _socket: Duplex) => {
      if (req.url === '/boom') throw new Error('claim failed')
      return false
    },
  })
  const doomed = new WebSocket(`ws://127.0.0.1:${served.port}/boom`)
  await new Promise<void>((resolve) => doomed.once('error', () => resolve()))
  const socket = connect(served.port)
  await whenOpen(socket)
  expect(await roundTrip(socket, 'hi')).toBe('echo:hi')
  await served.close()
}, 10_000)
