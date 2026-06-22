// The first-party whiteboard canvas effect, end to end in the real widget: toggling the `whiteboard`
// effect lazy-mounts the Excalidraw island into the widget's effect shadow root; toggling off unmounts
// it. Real browser, the built widget bundle (which includes the whiteboard extension), no mocks.
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {buildFixture, fixturePage, drive, ready, readBody, serveWidgetAsset} from './it-fixture.js'

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json'})
  res.end(JSON.stringify(body))
}

describe('whiteboard canvas effect (it): lazy-mounts Excalidraw in the widget shadow root', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}

  beforeAll(async () => {
    const html = fixturePage(await buildFixture())
    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (serveWidgetAsset(req, res)) return
      const url = req.url ?? ''
      // Minimal mandarax server so the widget takes its full mount path (which applies the built-in
      // whiteboard effect): a valid /models, a session resolve + detail. Everything else is harmless.
      if (url.startsWith('/api/chat/models')) {
        return writeJson(res, {
          models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
          defaultModel: 'sonnet',
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
        await readBody(req)
        return writeJson(res, {sessionId: 'mandarax_canvas_it'})
      }
      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        return writeJson(res, {
          sessionId: 'mandarax_canvas_it',
          harnessSessionId: null,
          name: null,
          origin: 'chat',
          cwd: '/app',
          lock: {held: false, role: null},
          usage: null,
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
      if (url.startsWith('/api/chat/history')) return writeJson(res, {messages: []})
      if (url.startsWith('/api/')) {
        res.writeHead(404)
        return res.end('{}')
      }
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
      res.end(html)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('enables the canvas, renders Excalidraw, and unmounts on disable', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    const enabled = await drive(page, {kind: 'effect', effect: 'whiteboard', action: 'enable'})
    expect(enabled).toMatchObject({effect: 'whiteboard', enabled: true})

    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
    expect(await page.locator('[data-whiteboard-error]').count()).toBe(0)

    const disabled = await drive(page, {kind: 'effect', effect: 'whiteboard', action: 'disable'})
    expect(disabled).toMatchObject({effect: 'whiteboard', enabled: false})
    await page.locator('canvas').first().waitFor({state: 'detached', timeout: 10_000})

    await page.close()
  })
})
