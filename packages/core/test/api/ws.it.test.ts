import {expect, test} from 'vitest'
import {Hono} from 'hono'
import {upgradeWebSocket} from '@hono/node-server'
import WebSocket from 'ws'
import {serveApp} from '@conciv/harness-testkit'
import {originAllowed} from '../../src/cors.js'

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
  const served = await serveApp(app.fetch)
  const wsUrl = `${served.wsBase}/__ws_probe`
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
    await served.close()
  }
}, 30_000)
