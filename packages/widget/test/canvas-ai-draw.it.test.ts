// Proves the AI-draw path is actually VISIBLE in the real widget: the server `canvas.draw` tool writes
// skeletons into the room's `pending` queue, the browser island converts them to elements and the canvas
// must PAINT them (not just hold them in the scene data). Full stack, real engine + whiteboard tools,
// real widget, opened from the composer button — the headless widget joins room `local:` and a tool call
// with no session header lands in that same room.
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
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
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
  core: string
} = {base: '', core: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-aidraw-'))
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
  state.core = `http://127.0.0.1:${engine.port}`
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (serveWidgetAsset(req, res)) return
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(pageHtml(state.core))
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

describe('whiteboard AI draw (it) — full stack', () => {
  it('paints a canvas.draw into the open widget canvas', async () => {
    const page = await state.browser!.newPage()
    // The canvas opens a y-websocket to /api/sync/<room>; read the room off that socket so the tool call
    // targets the exact session the canvas joined — same routing a real agent's MCP call gets.
    let room = ''
    page.on('websocket', (ws) => {
      const m = decodeURIComponent(ws.url()).match(/\/api\/sync\/(.+)$/)
      if (m) room = m[1]!
    })
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    const toggle = page.getByRole('button', {name: 'Open the whiteboard canvas'})
    await toggle.waitFor({state: 'visible', timeout: 30_000})
    await toggle.click()
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})
    await expect.poll(() => room).toContain('local:')
    const sid = room.slice('local:'.length)

    const blank = await canvasInk(page)
    const drawn = await fetch(`${state.core}/api/tools/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json', [MANDARAX_SESSION_HEADER]: sid},
      body: JSON.stringify({
        name: 'canvas.draw',
        input: {elements: [{type: 'rectangle', x: 120, y: 120, width: 320, height: 220}]},
      }),
    })
    expect(drawn.status).toBe(200)

    await expect.poll(() => canvasInk(page), {timeout: 20_000}).toBeGreaterThan(blank)
    await page.close()
  })
})
