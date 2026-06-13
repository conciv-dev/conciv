import {describe, it, expect, afterEach} from 'vitest'
import {createServer, get as httpGet, type Server} from 'node:http'
import {makeToolsRoute, type ToolsServer} from '../src/tools-route.js'

// Real HTTP round-trip for the page-bus: an http server hosting the real tools route, a raw
// SSE reader standing in for the browser widget, and real GET/POST via fetch. No mocks —
// exercises the true subscribe → server push → widget reply → tool-resolves path.

const viteFake: ToolsServer = {
  config: {root: '/w', base: '/', mode: 'development', resolve: {alias: []}, plugins: []},
  pluginContainer: {resolveId: async () => null},
  moduleGraph: {getModulesByFile: () => undefined},
}

function startServer(): Promise<{server: Server; base: string}> {
  const route = makeToolsRoute(viteFake, () => {})
  const server = createServer((req, res) => {
    void route(req, res, () => {
      res.statusCode = 404
      res.end('next')
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({server, base: `http://127.0.0.1:${port}`})
    })
  })
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  return (await res.json()) as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

// Subscribe to the page-stream as the widget would, answering each query by POSTing back.
// `onOpen` fires once the stream is up; returns a handle to end the connection.
function connectWidget(base: string, answerFor: (kind: string) => unknown, onOpen: () => void): {end: () => void} {
  const req = httpGet(`${base}/__pw/tools/page-stream`, (res) => {
    res.setEncoding('utf8')
    onOpen()
    res.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (!payload) continue
        const query = JSON.parse(payload) as {requestId?: string; kind?: string}
        if (!query.requestId) continue
        void postJson(`${base}/__pw/tools/page-reply`, {requestId: query.requestId, data: answerFor(query.kind ?? '')})
      }
    })
  })
  return {end: () => req.destroy()}
}

describe('tools-route page-bus (IT, real http)', () => {
  const state = {server: undefined as Server | undefined, widget: undefined as {end: () => void} | undefined}
  afterEach(async () => {
    state.widget?.end()
    await new Promise<void>((r) => (state.server ? state.server.close(() => r()) : r()))
    state.server = undefined
    state.widget = undefined
  })

  it('round-trips a page query: SSE push → widget reply → the tool call resolves', async () => {
    const {server, base} = await startServer()
    state.server = server
    await new Promise<void>((open) => {
      state.widget = connectWidget(base, () => ({pathname: '/checkout', search: ''}), open)
    })
    expect(await getJson(`${base}/__pw/tools/page/route`)).toEqual({pathname: '/checkout', search: ''})
  })

  it('returns an error when no widget is subscribed', async () => {
    const {server, base} = await startServer()
    state.server = server
    const body = await getJson<{error?: string}>(`${base}/__pw/tools/page/route`)
    expect(body.error).toContain('no widget')
  })

  it('round-trips a fill action and the journal records it', async () => {
    const {server, base} = await startServer()
    state.server = server
    await new Promise<void>((open) => {
      state.widget = connectWidget(base, () => ({ok: true}), open)
    })
    expect(await postJson(`${base}/__pw/tools/page/fill`, {selector: '#email', value: 'a@b.c'})).toEqual({ok: true})
    const changes = await getJson<Array<{verb: string; selector?: string; args: Record<string, unknown>}>>(
      `${base}/__pw/tools/page/changes`,
    )
    expect(changes).toMatchObject([{verb: 'fill', selector: '#email', args: {value: 'a@b.c'}}])
  })

  it('does NOT journal a read, and clear empties the journal', async () => {
    const {server, base} = await startServer()
    state.server = server
    await new Promise<void>((open) => {
      state.widget = connectWidget(base, () => ({text: 'hi'}), open)
    })
    await getJson(`${base}/__pw/tools/page/text?selector=%23h`)
    await postJson(`${base}/__pw/tools/page/click`, {selector: '.btn'})
    expect(await getJson<unknown[]>(`${base}/__pw/tools/page/changes`)).toHaveLength(1)
    await postJson(`${base}/__pw/tools/page/changes/clear`, {})
    expect(await getJson<unknown[]>(`${base}/__pw/tools/page/changes`)).toEqual([])
  })
})
