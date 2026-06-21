import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import getPort from 'get-port'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {chromium, type Browser} from 'playwright'
import * as Y from 'yjs'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync, type Sync} from '@mandarax/core/sync'
import {start, type Engine} from '@mandarax/core/engine'
import {collectServerContributions} from '@mandarax/extensions'
import type {LiveDb} from '@mandarax/protocol/db-types'
import {ORIGIN} from '@mandarax/protocol/sync-types'
import probe from './fixtures/__probe.js'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const jsonHeaders = {'content-type': 'application/json'}

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/probe-fixture.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    define: {'process.env.NODE_ENV': '"development"'},
    nodePaths: [join(here, '../node_modules'), join(here, '../../../node_modules')],
  })
  const built = res.outputFiles[0]
  if (!built) throw new Error('esbuild produced no fixture output')
  return built.text
}

function pageHtml(fixtureJs: string, core: string): string {
  return `<!doctype html><html><head></head><body><p id="status"></p><p id="canvas"></p><ul id="rows"></ul><script>window.__CORE__=${JSON.stringify(core)}</script><script>${fixtureJs}</script></body></html>`
}

function canvasUpdate(key: string, value: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getMap('data').set(key, value)
  return Y.encodeStateAsUpdate(doc)
}

async function runTool(core: string, name: string, input: unknown): Promise<Response> {
  return fetch(`${core}/api/tools/run`, {method: 'POST', headers: jsonHeaders, body: JSON.stringify({name, input})})
}

const state: {
  browser?: Browser
  pageServer?: Server
  engine?: Engine
  sup?: TrailSupervisor
  sync?: Sync
  db?: LiveDb
  dir?: string
  base: string
  core: string
} = {base: '', core: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-probe-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  const contributions = collectServerContributions([probe], {db, sync: sync.engine})
  state.db = db
  state.sync = sync
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

  const html = pageHtml(await bundleFixture(), state.core)
  const app = new H3()
  app.get('/', () => new Response(html, {headers: {'content-type': 'text/html'}}))
  const pageServer = serve({fetch: app.fetch, port: await getPort(), hostname: '127.0.0.1'})
  state.pageServer = pageServer
  await pageServer.ready()
  state.base = new URL(pageServer.url ?? '').origin
  state.browser = await chromium.launch()
}, 90_000)

afterAll(async () => {
  await state.browser?.close()
  await state.pageServer?.close()
  await state.engine?.stop()
  await state.sup?.stop()
  if (state.dir) rmSync(state.dir, {recursive: true, force: true})
})

describe('probe extension (it) — the full grown mx, real stack', () => {
  it('introspects the declared collection through mx.db.list', () => {
    expect(state.db!.list().map((info) => info.name)).toContain('probe_notes')
  })

  it('gates the approval tool and confirms session_start fired', async () => {
    const gated = await runTool(state.core, 'probe.del', {cid: 'whatever'})
    expect(gated.status).toBe(403)
    const status = await runTool(state.core, 'probe.status', {})
    expect(((await status.json()) as {result: boolean}).result).toBe(true)
  })

  it('reflects agent-path and composer-path inserts live and syncs the canvas room', async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.base}/?composer=1`)
    await page.getByText('db-ready').waitFor({state: 'visible', timeout: 15_000})

    await page.getByText('composer-row').waitFor({state: 'visible', timeout: 15_000})

    const added = await runTool(state.core, 'probe.add', {cid: crypto.randomUUID(), body: 'agent-row'})
    expect(added.status).toBe(200)
    await page.getByText('agent-row').waitFor({state: 'visible', timeout: 15_000})

    state.sync!.engine.room('probe').apply(canvasUpdate('pin', 'pinned-value'), ORIGIN.AI)
    await page.getByText('pinned-value').waitFor({state: 'visible', timeout: 15_000})
    await page.close()
  })
})
