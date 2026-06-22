// Solid comment pins, end to end in the real widget over the full stack: the whiteboard canvas effect
// mounts a light-DOM pins layer above the Excalidraw canvas; an AI comment.create over core writes the
// row + Yjs pin into the canvas room; the pin renders with author + status from the live comments
// collection, updates when the row's status changes, and never blocks drawing on the canvas beneath.
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
import type {ServerCollection} from '@mandarax/protocol/db-types'
import whiteboard, {COMMENT_COLUMNS, CommentRecordSchema, type CommentRecord} from '@mandarax/whiteboard'
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
  comments?: ServerCollection<CommentRecord>
  dir?: string
  base: string
  core: string
} = {base: '', core: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-pins-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  state.sync = sync
  const contributions = collectServerContributions([whiteboard], {db, sync: sync.engine})
  state.comments = db.collection<CommentRecord>('comments', {
    schema: CommentRecordSchema,
    columns: COMMENT_COLUMNS,
    fts: ['parts'],
  })
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

// No session header → the server tool scopes to room `local:`, which is the room the headless widget's
// canvas joins (no chat session active), so the pin lands where the canvas observes it.
const createComment = (core: string, input: unknown): Promise<Response> =>
  fetch(`${core}/api/tools/run`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name: 'comment.create', input}),
  })

describe('whiteboard pins (it) — full stack, real widget, real trail', () => {
  it('renders a pin from comment.create, reflects status, and never blocks drawing', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.locator('[data-pw-fab]').waitFor({state: 'visible', timeout: 30_000})

    const enabled = await drive(page, {kind: 'effect', effect: 'whiteboard', action: 'enable'})
    expect(enabled).toMatchObject({effect: 'whiteboard', enabled: true})
    await page.locator('canvas').first().waitFor({state: 'attached', timeout: 20_000})

    const cid = randomUUID()
    const created = await createComment(state.core, {
      cid,
      kind: 'floating',
      parts: [{type: 'text', text: 'look here'}],
      x: 120,
      y: 120,
      author_kind: 'human',
    })
    expect(created.status).toBe(200)

    const pin = page.locator(`[data-whiteboard-pin="${cid}"]`)
    await pin.waitFor({state: 'visible', timeout: 30_000})
    await expect.poll(() => pin.getAttribute('aria-label'), {timeout: 30_000}).toBe('Human comment, open')

    const hashBefore = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')].map((c) => c.toDataURL().length).join(','),
    )
    const tool = await page.evaluate(() => {
      const b = document.querySelector('[title*="Rectangle" i]')!.getBoundingClientRect()
      return {x: b.x + b.width / 2, y: b.y + b.height / 2}
    })
    await page.mouse.click(tool.x, tool.y)
    await page.mouse.move(480, 340)
    await page.mouse.down()
    await page.mouse.move(720, 520, {steps: 12})
    await page.mouse.up()
    await expect
      .poll(
        () => page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => c.toDataURL().length).join(',')),
        {timeout: 15_000},
      )
      .not.toBe(hashBefore)

    const now = Date.now()
    await state.comments!.update(cid, {status: 'resolved', updated_at: now, resolved_at: now})
    await expect.poll(() => pin.getAttribute('aria-label'), {timeout: 30_000}).toBe('Human comment, resolved')

    await page.close()
  })
})
