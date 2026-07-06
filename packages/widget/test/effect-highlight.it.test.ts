import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {buildFixture, fixturePage, readBody, ready} from './it-fixture.js'
import {until} from '@conciv/harness-testkit/until'

describe('highlight extension (it): Alt-hold, hover, click, open', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}
  const openSourceCalls: unknown[] = []
  const editorOpenCalls: unknown[] = []

  beforeAll(async () => {
    const fixtureJs = await buildFixture()
    const html = fixturePage(fixtureJs)
    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      if (req.method === 'POST' && url === '/api/page/open-source') {
        openSourceCalls.push(JSON.parse((await readBody(req)) || '{}'))
        res.writeHead(200, {'content-type': 'application/json'})
        return res.end(JSON.stringify({status: 'opened'}))
      }
      if (req.method === 'POST' && url === '/api/editor/open') {
        editorOpenCalls.push(JSON.parse((await readBody(req)) || '{}'))
        res.writeHead(200, {'content-type': 'application/json'})
        return res.end(JSON.stringify({ok: true}))
      }
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

  it('Alt-hold arms the inspector and a click on a component opens its source (attribute fast path)', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    await page.evaluate(() => document.querySelector('#card')?.setAttribute('data-conciv-source', '/src/Card.tsx:3:1'))

    await page.keyboard.down('Alt')

    await page.locator('[data-conciv-capture]').waitFor({timeout: 5000})

    const box = await page.locator('#card').boundingBox()
    if (!box) throw new Error('#card has no box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.click(cx, cy)

    await expect.poll(() => editorOpenCalls.length, {timeout: 5000}).toBeGreaterThan(0)
    expect(editorOpenCalls[0]).toEqual({file: '/src/Card.tsx', line: 3})

    await page.keyboard.up('Alt')
    await page.close()
  })

  it('releasing Alt tears the inspector down (no open on click after)', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await ready(page)

    await page.keyboard.down('Alt')
    await page.locator('[data-conciv-capture]').waitFor({timeout: 5000})
    await page.keyboard.up('Alt')
    await page.locator('[data-conciv-capture]').waitFor({state: 'detached', timeout: 5000})

    const baseline = openSourceCalls.length + editorOpenCalls.length
    const box = await page.locator('#card-inc').boundingBox()
    await page.mouse.click(box!.x + 5, box!.y + 5)

    await until(() => openSourceCalls.length + editorOpenCalls.length === baseline, {settleFor: 300, hangGuardMs: 2000})
    expect(openSourceCalls.length + editorOpenCalls.length).toBe(baseline)
    await page.close()
  })
})
