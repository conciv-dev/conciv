// The widget driven in a REAL browser; an extension seeded via window.__MANDARAX__.queue paints a
// header, footer, status, and keyed widget (factories return real DOM nodes — Solid inserts them, so
// the page can author them in plain JS). Real bundle, real browser, native assertions.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const widgetBundle = fs.readFileSync(path.join(dirname, '../dist/mandarax-widget.global.js'), 'utf8')

function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>
      function node(tag, text, attrs) {
        var el = document.createElement(tag)
        el.textContent = text
        if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k])
        return el
      }
      window.__MANDARAX__ = { queue: [ {
        id: 'acme',
        clientFn: function (mx) {
          mx.ui.setHeader(function () { return node('div', 'Acme banner') })
          mx.ui.setFooter(function () { return node('div', 'Acme footer') })
          mx.ui.setStatus('tokens', 'Tokens: 42')
          mx.ui.setWidget('deploy', function () { return node('button', 'Deploy now', {type: 'button'}) })
          mx.ui.setEmptyState(function () { return node('div', 'Custom welcome!') })
        },
      } ] }
    </script>
  </head><body>
    <script>${widgetBundle}</script>
  </body></html>`
}

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

describe('widget extension UI store (it) — real browser', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
        return writeJson(res, {sessionId: 'mandarax_new_1'})
      }
      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        return writeJson(res, {
          sessionId: 'mandarax_new_1',
          harnessSessionId: null,
          name: null,
          origin: 'chat',
          cwd: '/app',
          lock: {held: false, role: null},
          usage: null,
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/models')) {
        return writeJson(res, {
          models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
          defaultModel: 'sonnet',
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
      if (url.startsWith('/api/chat/history')) return writeJson(res, [])
      if (url === '/api/page/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        })
        return
      }
      res.writeHead(200, {'content-type': 'text/html'})
      res.end(pageHtml())
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('paints header, footer, status, and a keyed widget from an extension', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByText('Acme banner').waitFor({state: 'visible'})
    await page.getByText('Acme footer').waitFor({state: 'visible'})
    await page.getByText('Tokens: 42').waitFor({state: 'visible'})
    await page.getByRole('button', {name: 'Deploy now'}).waitFor({state: 'visible'})
    await page.close()
  })

  it('overrides the empty state via ui.setEmptyState', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByText('Custom welcome!').waitFor({state: 'visible'})
    expect(await page.getByText('How can I help you today?').count()).toBe(0)
    await page.close()
  })
})
