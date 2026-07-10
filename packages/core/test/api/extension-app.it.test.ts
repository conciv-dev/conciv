import {expect, test} from 'vitest'
import {Hono} from 'hono'
import {streamSSE} from 'hono/streaming'
import {upgradeWebSocket} from '@hono/node-server'
import WebSocket from 'ws'
import {serveApp} from '@conciv/harness-testkit'
import {slug} from '../../src/app.js'
import {corsMiddleware, type CorsVars} from '../../src/cors.js'

type ProbeEnv = {Variables: {probe: {label: string}} & CorsVars}

const probeApp = new Hono<ProbeEnv>()
  .get('/status', (c) => c.json({ok: true, label: c.var.probe.label}))
  .get('/stream', (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({data: JSON.stringify({tick: 1})})
      await new Promise<void>((resolve) => stream.onAbort(resolve))
    }),
  )
  .get(
    '/ws',
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        ws.send(`echo:${String(event.data)}`)
      },
    })),
  )

test('extension sub-app serves GET + SSE + ws under /api/ext/<slug>/; bad origin rejected', async () => {
  const mounted = new Hono<ProbeEnv>()
    .use(async (c, next) => {
      c.set('probe', {label: 'live'})
      await next()
    })
    .route('/', probeApp)
  const app = new Hono<{Variables: CorsVars}>()
    .use(async (c, next) => {
      c.set('cors', {allowedOrigins: []})
      await next()
    })
    .use(corsMiddleware())
    .route(`/api/ext/${slug('Test Runner')}`, mounted)
  const served = await serveApp(app.fetch)
  const base = served.base
  try {
    expect(await (await fetch(`${base}/api/ext/test-runner/status`)).json()).toEqual({ok: true, label: 'live'})

    const stream = await fetch(`${base}/api/ext/test-runner/stream`)
    const frame = await stream.body!.getReader().read()
    expect(new TextDecoder().decode(frame.value)).toContain('tick')

    const echo = await new Promise<string>((resolve, reject) => {
      const client = new WebSocket(`${served.wsBase}/api/ext/test-runner/ws`)
      client.on('open', () => client.send('hi'))
      client.on('message', (data) => {
        resolve(String(data))
        client.close()
      })
      client.on('error', reject)
    })
    expect(echo).toBe('echo:hi')

    const forbidden = await fetch(`${base}/api/ext/test-runner/status`, {headers: {origin: 'http://evil.com'}})
    expect(forbidden.status).toBe(403)
  } finally {
    await served.close()
  }
}, 30_000)
