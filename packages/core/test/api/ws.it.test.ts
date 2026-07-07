import {expect, test} from 'vitest'
import {Hono} from 'hono'
import {serve, upgradeWebSocket} from '@hono/node-server'
import WebSocket, {WebSocketServer} from 'ws'
import {originAllowed} from '../../src/api/cors.js'

test('ws upgrades and echoes; non-loopback origin is rejected', async () => {
  const app = new Hono()
  app.use('/__ws_probe', async (c, next) => {
    if (!originAllowed(c.req.header('origin') ?? null, new Set())) return c.text('forbidden origin', 403)
    await next()
  })
  app.get(
    '/__ws_probe',
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        ws.send(`echo:${String(event.data)}`)
      },
    })),
  )
  const wss = new WebSocketServer({noServer: true})
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1', websocket: {server: wss}})
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const wsUrl = `ws://127.0.0.1:${port}/__ws_probe`
  try {
    const echo = await new Promise<string>((resolve, reject) => {
      const client = new WebSocket(wsUrl)
      client.on('open', () => client.send('hi'))
      client.on('message', (data) => {
        resolve(String(data))
        client.close()
      })
      client.on('error', reject)
    })
    expect(echo).toBe('echo:hi')
    const rejected = await new Promise<boolean>((resolve) => {
      const client = new WebSocket(wsUrl, {headers: {origin: 'http://evil.com'}})
      client.on('open', () => {
        client.close()
        resolve(false)
      })
      client.on('error', () => resolve(true))
    })
    expect(rejected).toBe(true)
  } finally {
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}, 30_000)
