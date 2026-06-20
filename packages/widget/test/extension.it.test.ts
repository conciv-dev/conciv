// The widget driven in a REAL browser; a page registers an extension via window.__MANDARAX__ and we
// assert the theme override + the added composer button take effect. Real bundle, real browser.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const widgetBundle = fs.readFileSync(path.join(dirname, '../dist/mandarax-widget.global.js'), 'utf8')

// Register an extension BEFORE the widget bundle runs by seeding window.__MANDARAX__.queue; the
// bundle's installExtensionGlobal drains it on mount. clientFn sets a blue accent and adds a button.
function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>
      window.__MANDARAX__ = { queue: [ {
        id: 'acme',
        clientFn: function (mx) {
          mx.ui.setTheme({ 'pw-accent': 'rgb(37, 99, 235)' })
          mx.registerComposerAction({
            id: 'deploy',
            label: 'Deploy',
            icon: function () { return null },
            onClick: function () {},
          })
        },
      } ] }
    </script>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

describe('widget extensions (it) — real browser', () => {
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

  it('applies an extension theme override and adds a composer action', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)

    const fab = page.getByRole('button', {name: 'Open mandarax chat'})
    await fab.waitFor({state: 'visible'})

    // The theme override set --pw-accent on :host; the FAB resolves it from the shadow root.
    const accent = await fab.evaluate((el) => getComputedStyle(el).getPropertyValue('--pw-accent').trim())
    expect(accent).toBe('rgb(37, 99, 235)')

    // The registered composer action renders as a button (registry is reactive post-mount).
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.getByRole('button', {name: 'Deploy'}).waitFor({state: 'visible'})
    await page.close()
  })
})
