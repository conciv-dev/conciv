// Comment threads end to end in the real widget: clicking a pin opens the Solid thread panel, which
// renders each comment's parts through @mandarax/tool-ui (text inline, tool parts as tool cards), and
// offers reply + resolve controls. Full stack: real engine + trail + the built widget bundle.
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
  const dir = mkdtempSync(join(tmpdir(), 'mx-thread-'))
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

describe('whiteboard thread (it) — full stack, tool-ui parts, reply + resolve', () => {
  it('opens a thread on pin click and renders replies with a tool card', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.locator('[data-pw-fab]').waitFor({state: 'visible', timeout: 30_000})
    await drive(page, {kind: 'effect', effect: 'whiteboard', action: 'enable'})
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    const root = randomUUID()
    expect(
      (
        await tool(state.core, 'comment.create', {
          cid: root,
          kind: 'floating',
          parts: [{type: 'text', text: 'root note'}],
          x: 140,
          y: 140,
          author_kind: 'human',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await tool(state.core, 'comment.reply', {
          cid: root,
          parts: [{type: 'tool', name: 'canvas.draw', arguments: {elements: []}}],
          author_kind: 'ai',
        })
      ).status,
    ).toBe(200)

    const pin = page.locator(`[data-whiteboard-pin="${root}"]`)
    await pin.waitFor({state: 'visible', timeout: 30_000})
    await pin.click()

    const thread = page.locator(`[data-whiteboard-thread="${root}"]`)
    await thread.waitFor({state: 'visible', timeout: 15_000})
    await thread.getByText('root note').waitFor({state: 'visible', timeout: 30_000})
    await thread.getByText('canvas.draw').waitFor({state: 'visible', timeout: 30_000})
    await thread.getByRole('button', {name: 'Resolve thread'}).waitFor({state: 'visible'})
    await thread.getByRole('textbox', {name: 'Reply'}).waitFor({state: 'visible'})

    await page.close()
  })
})
