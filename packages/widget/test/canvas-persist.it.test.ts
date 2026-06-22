// Reproduces the reported "draw, close the canvas, reopen — it's all gone" bug: a drawing must survive
// toggling the canvas off and back on (same page, same session). Full stack, real widget, opened from
// the composer button (the user's path), not the page driver.
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {chromium, type Browser, type Page} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync, type Sync} from '@mandarax/core/sync'
import {start, type Engine} from '@mandarax/core/engine'
import {collectServerContributions} from '@mandarax/extensions'
import whiteboard from '@mandarax/whiteboard'
import {serveWidgetAsset, widgetScriptTag} from './it-fixture.js'

function pageHtml(core: string): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="${core}">
    <meta name="pw-preview-id" content="local">
  </head><body>${widgetScriptTag}</body></html>`
}

const state: {
  browser?: Browser
  server?: Server
  engine?: Engine
  sup?: TrailSupervisor
  sync?: Sync
  dir?: string
  base: string
} = {base: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-persist-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  state.sync = sync
  const contributions = collectServerContributions([whiteboard], {db, sync: sync.engine, cwd: dir})
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  state.sup = sup
  await sup.start()
  const engine = await start({
    options: {stateRoot: dir, harnessBin: 'true'},
    root: dir,
    launchEditor: () => {},
    extensions: contributions,
    dbProxyTarget: sup.baseUrl,
    syncHooks: sync.hooks,
  })
  state.engine = engine
  const html = pageHtml(`http://127.0.0.1:${engine.port}`)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (serveWidgetAsset(req, res)) return
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(html)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.server = server
  state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  state.browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await state.browser?.close()
  state.server?.close()
  await state.engine?.stop()
  await state.sup?.stop()
  if (state.dir) rmSync(state.dir, {recursive: true, force: true})
})

const canvasInk = (page: Page): Promise<number> =>
  page.evaluate(() => [...document.querySelectorAll('canvas')].reduce((n, c) => n + c.toDataURL().length, 0))

describe('whiteboard canvas persistence (it) — full stack', () => {
  it('keeps a drawing after closing and reopening the canvas', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    const toggle = page.getByRole('button', {name: 'Open the whiteboard canvas'})
    await toggle.waitFor({state: 'visible', timeout: 30_000})
    await toggle.click()
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    const blank = await canvasInk(page)
    const tool = await page.evaluate(() => {
      const b = document.querySelector('[title*="Rectangle" i]')!.getBoundingClientRect()
      return {x: b.x + b.width / 2, y: b.y + b.height / 2}
    })
    await page.mouse.click(tool.x, tool.y)
    await page.mouse.move(480, 340)
    await page.mouse.down()
    await page.mouse.move(760, 560, {steps: 12})
    await page.mouse.up()
    await expect.poll(() => canvasInk(page), {timeout: 10_000}).toBeGreaterThan(blank)

    // Close the canvas, then reopen it — the drawing must come back.
    await toggle.click()
    await page.locator('canvas').first().waitFor({state: 'detached', timeout: 10_000})
    await toggle.click()
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    await expect.poll(() => canvasInk(page), {timeout: 15_000}).toBeGreaterThan(blank)
    await page.close()
  })
})
