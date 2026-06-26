import {afterEach, describe, expect, it} from 'vitest'
import {createServer, type Server, type ServerResponse} from 'node:http'
import {EXTENSIONS_ROUTE, type Middleware, makeWidgetInject} from '../src/core/widget-middleware.js'

// Real HTTP round-trip for the widget inject middleware. It must rewrite the FINAL html response
// (the path SSR frameworks like TanStack Start exercise, where there's no static index.html for
// vite's transformIndexHtml to touch), injecting the single client entry module — which loads the
// widget + extensions through one Vite graph. A tiny http server runs the real middleware. No mocks.

const ENTRY = `<script type="module" src="${EXTENSIONS_ROUTE}"></script>`
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

  it('injects the client entry into a streamed text/html response, before </head>', async () => {
    const {server, base} = await startServer(makeWidgetInject(PREVIEW, API_BASE), (res) => {
      res.setHeader('content-type', 'text/html')
      // Two writes + end — the way a streaming SSR renderer flushes its document.
      res.write('<!doctype html><html><head><title>app</title></head>')
      res.write('<body><h1>hi</h1></body>')
      res.end('</html>')
    })
    state.server = server
    const html = await (await fetch(base)).text()
    expect(html).toContain(ENTRY)
    expect(html).toContain(`<meta name="pw-api-base" content="${API_BASE}">`)
    expect(html.indexOf(EXTENSIONS_ROUTE)).toBeLessThan(html.indexOf('</head>'))
    expect(html).toContain('<h1>hi</h1>')
  })

  it('injects when headers arrive via writeHead(status, statusText, flat-array) + end(cb) (srvx shape)', async () => {
    // The exact shape TanStack Start's runtime (srvx) uses: a flat [k, v, …] header array and an
    // end() callback it awaits — if either is mishandled the body isn't rewritten or the request hangs.
    const {server, base} = await startServer(makeWidgetInject(PREVIEW, API_BASE), (res) => {
      res.writeHead(200, 'OK', ['content-type', 'text/html; charset=utf-8'])
      res.write('<!doctype html><html><head><title>app</title></head><body>hi</body></html>')
      res.end(() => {})
    })
    state.server = server
    const res = await fetch(base)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain(ENTRY)
    expect(html.indexOf(EXTENSIONS_ROUTE)).toBeLessThan(html.indexOf('</head>'))
  })

  it('injects the pw-widget config meta into the SSR html response (the path the site uses)', async () => {
    const widgetConfig = {quickTerminal: {hotkey: ['Alt+k']}}
    const {server, base} = await startServer(makeWidgetInject(PREVIEW, API_BASE, widgetConfig), (res) => {
      res.setHeader('content-type', 'text/html')
      res.end('<!doctype html><html><head><title>app</title></head><body>hi</body></html>')
    })
    state.server = server
    const html = await (await fetch(base)).text()
    expect(html).toContain('name="pw-widget"')
    expect(html).toContain('Alt+k')
    expect(html.indexOf('pw-widget')).toBeLessThan(html.indexOf('</head>'))
  })

  it('passes non-html responses through untouched', async () => {
    const {server, base} = await startServer(makeWidgetInject(PREVIEW, API_BASE), (res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ok: true}))
    })
    state.server = server
    const body = await (await fetch(base)).text()
    expect(body).toBe('{"ok":true}')
    expect(body).not.toContain(EXTENSIONS_ROUTE)
  })

  it('does not double-inject when the html already references the client entry', async () => {
    const preinjected = `<html><head>${ENTRY}</head><body>x</body></html>`
    const {server, base} = await startServer(makeWidgetInject(PREVIEW, API_BASE), (res) => {
      res.setHeader('content-type', 'text/html')
      res.end(preinjected)
    })
    state.server = server
    const html = await (await fetch(base)).text()
    const occurrences = html.split(`src="${EXTENSIONS_ROUTE}"`).length - 1
    expect(occurrences).toBe(1)
  })
})
