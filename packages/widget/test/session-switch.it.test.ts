// The canvas follows the widget's active session: starting a new session re-binds the canvas to the
// new session's room, so a pin from the previous session's room is no longer shown. Full stack.
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
  const dir = mkdtempSync(join(tmpdir(), 'mx-sesswitch-'))
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

describe('whiteboard canvas follows the active session (it) — full stack', () => {
  it('re-scopes the canvas to a new session, dropping the previous session pin', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.locator('[data-pw-fab]').waitFor({state: 'visible', timeout: 30_000})
    await drive(page, {kind: 'effect', effect: 'whiteboard', action: 'enable'})
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    // Pin a comment into the canvas's current (no-header) room while it is showing it.
    const cid = randomUUID()
    expect(
      (
        await tool(state.core, 'comment.create', {
          cid,
          kind: 'floating',
          parts: [{type: 'text', text: 'session A'}],
          x: 200,
          y: 200,
          author_kind: 'human',
        })
      ).status,
    ).toBe(200)

    const pin = page.locator(`[data-whiteboard-pin="${cid}"]`)
    await pin.waitFor({state: 'visible', timeout: 30_000})

    // Switch the widget to a new session; the canvas re-binds to the new room and drops the old pin.
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByRole('button', {name: 'Start a new session'}).click()
    await pin.waitFor({state: 'detached', timeout: 30_000})
    await page.close()
  })
})
