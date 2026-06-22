// Dragging a source-linked pin opens the drift prompt; "Keep link, accept drift" flips the pin to an
// offset state and draws a tether back to its locked origin. Full stack, real widget + canvas.
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {randomUUID} from 'node:crypto'
import type {AddressInfo} from 'node:net'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync, type Sync} from '@mandarax/core/sync'
import {start, type Engine} from '@mandarax/core/engine'
import {collectServerContributions} from '@mandarax/extensions'
import whiteboard from '@mandarax/whiteboard'
import {serveWidgetAsset, widgetScriptTag, drive} from './it-fixture.js'

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
  const dir = mkdtempSync(join(tmpdir(), 'mx-pin-drag-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  state.sync = sync
  const contributions = collectServerContributions([whiteboard], {db, sync: sync.engine})
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

  const html = pageHtml(state.core)
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

const tool = (core: string, name: string, input: unknown): Promise<Response> =>
  fetch(`${core}/api/tools/run`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name, input}),
  })

describe('whiteboard pin drag drift (it) — full stack', () => {
  it('drags a locked pin to a drift prompt and keeps the link as an offset with a tether', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.locator('[data-pw-fab]').waitFor({state: 'visible', timeout: 30_000})
    await drive(page, {kind: 'effect', effect: 'whiteboard', action: 'enable'})
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    const cid = randomUUID()
    expect(
      (
        await tool(state.core, 'comment.create', {
          cid,
          kind: 'source-linked',
          parts: [{type: 'text', text: 'drift me'}],
          anchor: {source: {file: 'src/App.tsx', line: 9, column: 1, component: 'App'}},
          x: 300,
          y: 300,
          author_kind: 'human',
        })
      ).status,
    ).toBe(200)

    const pin = page.locator(`[data-whiteboard-pin="${cid}"]`)
    await pin.waitFor({state: 'visible', timeout: 30_000})
    expect(await pin.getAttribute('data-pin-state')).toBe('locked')

    const box = (await pin.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + 160, {steps: 12})
    await page.mouse.up()

    const dragPrompt = page.locator('[data-whiteboard-drag-prompt]')
    await dragPrompt.waitFor({state: 'visible', timeout: 10_000})
    await dragPrompt.getByRole('button', {name: 'Disconnect from source'}).waitFor({state: 'visible'})
    await dragPrompt.getByRole('button', {name: 'Cancel'}).waitFor({state: 'visible'})
    await dragPrompt.getByRole('button', {name: 'Keep link, accept drift'}).click()

    await expect.poll(() => pin.getAttribute('data-pin-state'), {timeout: 10_000}).toBe('offset')
    await page.locator(`[data-whiteboard-tether="${cid}"]`).waitFor({state: 'attached', timeout: 10_000})
    await dragPrompt.waitFor({state: 'detached', timeout: 10_000})
    await page.close()
  })
})
