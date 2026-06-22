// The whiteboard "Comment" composer action + the source-linked pin badge, in the real widget over the
// full stack. Verifies the pick seam wiring (the action registers and entering it activates react-grab
// selection through ClientApi.pick) and that a source-linked comment renders a file:line anchor badge.
// react-grab's interactive element selection + comment prompt is exercised manually in the live app;
// driving its internal prompt UI headless is brittle, so this IT covers the deterministic seam + badge.
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
  const dir = mkdtempSync(join(tmpdir(), 'mx-comment-action-'))
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

describe('whiteboard Comment action + source-linked badge (it) — full stack', () => {
  it('registers the Comment action and entering it activates react-grab selection', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    const action = page.getByRole('button', {name: 'Comment on an element'})
    await action.waitFor({state: 'visible', timeout: 30_000})
    await action.click()
    await page.getByRole('button', {name: 'Cancel element pick'}).waitFor({state: 'visible', timeout: 15_000})
    await page.keyboard.press('Escape')
    await page.close()
  })

  it('renders a file:line anchor badge for a source-linked comment', async () => {
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
          parts: [{type: 'text', text: 'fix this prop'}],
          anchor: {source: {file: 'src/App.tsx', line: 42, column: 3, component: 'App'}},
          x: 160,
          y: 160,
          author_kind: 'human',
        })
      ).status,
    ).toBe(200)

    await page.locator(`[data-whiteboard-pin="${cid}"]`).waitFor({state: 'visible', timeout: 30_000})
    await page.getByText('App.tsx:42').waitFor({state: 'visible', timeout: 30_000})
    await page.close()
  })
})
