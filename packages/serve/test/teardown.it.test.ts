import {expect, test} from 'vitest'
import {Hono} from 'hono'
import {upgradeWebSocket} from '@hono/node-server'
import WebSocket from 'ws'
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
