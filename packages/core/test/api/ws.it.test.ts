import {expect, test} from 'vitest'
import {H3, defineWebSocketHandler} from 'h3'
import {serve} from 'srvx'
import WebSocket from 'ws'
import {attachWebSocket} from '../../src/api/ws.js'
import {originAllowed} from '../../src/api/cors.js'

test('ws upgrades and echoes; non-loopback origin is rejected', async () => {
  const app = new H3()
  app.get(
    '/__ws_probe',
    defineWebSocketHandler({
      message: (peer, message) => {
        peer.send(`echo:${message.text()}`)
      },
    }),
  )
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  attachWebSocket(server, app, (origin) => originAllowed(origin, new Set()))
  const wsUrl = `${new URL(server.url ?? '').origin.replace('http', 'ws')}/__ws_probe`
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
    await server.close(true)
  }
}, 30_000)
