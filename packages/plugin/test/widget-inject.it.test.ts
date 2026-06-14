import {afterEach, describe, expect, it} from 'vitest'
import {createServer, type Server, type ServerResponse} from 'node:http'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  DEFAULT_WIDGET_ROUTE,
  type Middleware,
  makeWidgetInject,
  makeWidgetServe,
} from '../src/core/widget-middleware.js'

// Real HTTP round-trip for the widget middlewares. The inject middleware must rewrite the
// FINAL html response (the path SSR frameworks like TanStack Start exercise, where there's no
// static index.html for vite's transformIndexHtml to touch). A tiny http server runs the real
// middleware in front of a handler that produces html the way a framework would. No mocks.

const WIDGET_URL = '/@aidx/widget.js'
const PREVIEW = 'local'
const API_BASE = 'http://127.0.0.1:12345'

// Run `mw` in front of `final` on a throwaway server; return its base URL.
function startServer(mw: Middleware, final: (res: ServerResponse) => void): Promise<{server: Server; base: string}> {
  const server = createServer((req, res) => {
    mw(req, res, () => final(res))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({server, base: `http://127.0.0.1:${port}`})
    })
  })
}

describe('widget inject middleware (IT, real http)', () => {
  const state = {server: undefined as Server | undefined}
  afterEach(async () => {
    await new Promise<void>((r) => (state.server ? state.server.close(() => r()) : r()))
    state.server = undefined
  })

  it('injects the widget tags into a streamed text/html response, before </head>', async () => {
    const {server, base} = await startServer(makeWidgetInject(WIDGET_URL, PREVIEW, API_BASE), (res) => {
      res.setHeader('content-type', 'text/html')
      // Two writes + end — the way a streaming SSR renderer flushes its document.
      res.write('<!doctype html><html><head><title>app</title></head>')
      res.write('<body><h1>hi</h1></body>')
      res.end('</html>')
    })
    state.server = server
    const html = await (await fetch(base)).text()
    expect(html).toContain(`<script src="${WIDGET_URL}" defer></script>`)
    expect(html).toContain(`<meta name="pw-api-base" content="${API_BASE}">`)
    // Injected into the head, before the framework's own markup closes it.
    expect(html.indexOf(WIDGET_URL)).toBeLessThan(html.indexOf('</head>'))
    expect(html).toContain('<h1>hi</h1>')
  })

  it('injects when headers arrive via writeHead(status, statusText, flat-array) + end(cb) (srvx shape)', async () => {
    // The exact shape TanStack Start's runtime (srvx) uses: a flat [k, v, …] header array and an
    // end() callback it awaits — if either is mishandled the body isn't rewritten or the request
    // hangs.
    const {server, base} = await startServer(makeWidgetInject(WIDGET_URL, PREVIEW, API_BASE), (res) => {
      res.writeHead(200, 'OK', ['content-type', 'text/html; charset=utf-8'])
      res.write('<!doctype html><html><head><title>app</title></head><body>hi</body></html>')
      res.end(() => {})
    })
    state.server = server
    const res = await fetch(base)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain(`<script src="${WIDGET_URL}" defer></script>`)
    expect(html.indexOf(WIDGET_URL)).toBeLessThan(html.indexOf('</head>'))
  })

  it('passes non-html responses through untouched', async () => {
    const {server, base} = await startServer(makeWidgetInject(WIDGET_URL, PREVIEW, API_BASE), (res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ok: true}))
    })
    state.server = server
    const body = await (await fetch(base)).text()
    expect(body).toBe('{"ok":true}')
    expect(body).not.toContain(WIDGET_URL)
  })

  it('does not double-inject when the html already references the widget', async () => {
    const preinjected = `<html><head><script src="${WIDGET_URL}" defer></script></head><body>x</body></html>`
    const {server, base} = await startServer(makeWidgetInject(WIDGET_URL, PREVIEW, API_BASE), (res) => {
      res.setHeader('content-type', 'text/html')
      res.end(preinjected)
    })
    state.server = server
    const html = await (await fetch(base)).text()
    const occurrences = html.split(`src="${WIDGET_URL}"`).length - 1
    expect(occurrences).toBe(1)
  })

  it('serves the bundled widget file at the default route, and defers other paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aidx-widget-'))
    const file = join(dir, 'widget.global.js')
    writeFileSync(file, 'globalThis.__widget = 1')
    const {server, base} = await startServer(makeWidgetServe(file), (res) => {
      res.statusCode = 404
      res.end('not-found')
    })
    state.server = server
    const served = await fetch(`${base}${DEFAULT_WIDGET_ROUTE}`)
    expect(served.headers.get('content-type')).toContain('text/javascript')
    expect(await served.text()).toBe('globalThis.__widget = 1')
    const other = await fetch(`${base}/something-else`)
    expect(other.status).toBe(404)
    expect(await other.text()).toBe('not-found')
  })
})
