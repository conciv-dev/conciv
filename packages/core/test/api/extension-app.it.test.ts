import {expect, test} from 'vitest'
import {H3, defineWebSocketHandler} from 'h3'
import {serve} from 'srvx'
import WebSocket from 'ws'
import {makeExtensionApp} from '../../src/extension-app.js'
import {attachWebSocket} from '../../src/api/ws.js'
import {originAllowed} from '../../src/api/cors.js'
import {sseStream} from '../../src/api/sse.js'

test('extension sub-app serves GET + SSE + ws under /api/ext/<slug>/; bad origin rejected', async () => {
  const app = new H3()
  const guard = (origin: string | null) => originAllowed(origin, new Set())
  const sub = makeExtensionApp(app, 'Test Runner', guard)
  sub.get('/status', () => ({ok: true}))
  sub.get('/stream', (event) =>
    sseStream(event, 'ok', (emit) => {
      emit({tick: 1})
      return () => {}
    }),
  )
  sub.get(
    '/ws',
    defineWebSocketHandler({
      message: (peer, message) => {
        peer.send(`echo:${message.text()}`)
      },
    }),
  )
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  attachWebSocket(server, app, guard)
  const base = new URL(server.url ?? '').origin
  try {
    expect(await (await fetch(`${base}/api/ext/test-runner/status`)).json()).toEqual({ok: true})

    const stream = await fetch(`${base}/api/ext/test-runner/stream`)
    const frame = await stream.body!.getReader().read()
    expect(new TextDecoder().decode(frame.value)).toContain('tick')

    const echo = await new Promise<string>((resolve, reject) => {
      const client = new WebSocket(`${base.replace('http', 'ws')}/api/ext/test-runner/ws`)
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
    await server.close(true)
  }
}, 30_000)
