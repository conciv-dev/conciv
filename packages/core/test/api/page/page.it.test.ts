import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {registerPageRoutes} from '../../../src/api/page/page.js'
import {makeJournal} from '../../../src/page/journal.js'

// Real HTTP round-trip for the page-bus over the h3 app: a fetch-based SSE reader stands in
// for the browser widget, answering each query by POSTing back. Exercises the true
// subscribe → server push → widget reply → query-resolves path.

async function startServer(): Promise<{server: Server; base: string}> {
  const app = new H3()
  registerPageRoutes(app, {journal: makeJournal()})
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

async function getJson(url: string): Promise<unknown> {
  return (await fetch(url)).json()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  })
  return res.json()
}

const ErrorSchema = z.object({message: z.string()})
const ChangesSchema = z.array(
  z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
)

// Subscribe to /api/page/stream as the widget would, answering each query by POSTing back.
// Resolves once the stream is open; the returned handle ends the connection.
async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  base: string,
  answerFor: (kind: string) => unknown,
): Promise<void> {
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (!payload) continue
        const query: {requestId?: string; kind?: string} = JSON.parse(payload)
        if (!query.requestId) continue
        void postJson(`${base}/api/page/reply`, {requestId: query.requestId, data: answerFor(query.kind ?? '')})
      }
    }
  } catch {
    // aborted on teardown
  }
}

async function connectWidget(base: string, answerFor: (kind: string) => unknown): Promise<{end: () => void}> {
  const ctrl = new AbortController()
  const res = await fetch(`${base}/api/page/stream`, {signal: ctrl.signal})
  const body = res.body
  if (!body) throw new Error('page-stream had no body')
  void pumpStream(body.getReader(), base, answerFor)
  return {end: () => ctrl.abort()}
}

describe('page routes page-bus (IT, real http over h3)', () => {
  const state = {server: undefined as Server | undefined, widget: undefined as {end: () => void} | undefined}
  afterEach(async () => {
    state.widget?.end()
    if (state.server) await state.server.close()
    state.server = undefined
    state.widget = undefined
  })

  it('round-trips a page query: SSE push → widget reply → the query resolves', async () => {
    const {server, base} = await startServer()
    state.server = server
    state.widget = await connectWidget(base, () => ({pathname: '/checkout', search: ''}))
    expect(await getJson(`${base}/api/page/route`)).toEqual({pathname: '/checkout', search: ''})
  })

  it('returns 503 when no widget is subscribed', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/page/route`)
    expect(res.status).toBe(503)
    const body = ErrorSchema.parse(await res.json())
    expect(body.message).toContain('no widget')
  })

  it('round-trips a fill action and the journal records it', async () => {
    const {server, base} = await startServer()
    state.server = server
    state.widget = await connectWidget(base, () => ({ok: true}))
    expect(await postJson(`${base}/api/page/fill`, {selector: '#email', value: 'a@b.c'})).toEqual({ok: true})
    const changes = ChangesSchema.parse(await getJson(`${base}/api/page/changes`))
    expect(changes).toMatchObject([{verb: 'fill', selector: '#email', args: {value: 'a@b.c'}}])
  })

  it('does NOT journal a read, and clear empties the journal', async () => {
    const {server, base} = await startServer()
    state.server = server
    state.widget = await connectWidget(base, () => ({text: 'hi'}))
    await getJson(`${base}/api/page/text?selector=%23h`)
    await postJson(`${base}/api/page/click`, {selector: '.btn'})
    expect(ChangesSchema.parse(await getJson(`${base}/api/page/changes`))).toHaveLength(1)
    await postJson(`${base}/api/page/changes/clear`, {})
    expect(ChangesSchema.parse(await getJson(`${base}/api/page/changes`))).toEqual([])
  })
})
