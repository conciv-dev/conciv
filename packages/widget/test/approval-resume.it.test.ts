import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import getPort from 'get-port'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync, type Sync} from '@mandarax/core/sync'
import {start, type Engine} from '@mandarax/core/engine'
import {collectServerContributions} from '@mandarax/extensions'
import probe from './fixtures/__probe.js'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/approval-resume-fixture.ts')],
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
  return `<!doctype html><html><head></head><body><p id="status"></p><ul id="rows"></ul><button id="del">Delete</button><button id="allow">Allow</button><script>window.__CORE__=${JSON.stringify(core)}</script><script>${fixtureJs}</script></body></html>`
}

const state: {
  browser?: Browser
  pageServer?: Server
  engine?: Engine
  sup?: TrailSupervisor
  sync?: Sync
  dir?: string
  base: string
  core: string
} = {base: '', core: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-approval-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  const contributions = collectServerContributions([probe], {db, sync: sync.engine})
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

describe('approval resume (it) — widget-direct confirm-then-run on the real stack', () => {
  it('gates an ask tool, then runs it on confirm', async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.base}/`)
    await page.getByText('to-delete').waitFor({state: 'visible', timeout: 15_000})

    await page.getByRole('button', {name: 'Delete'}).click()
    await page.getByText('needs-approval').waitFor({state: 'visible', timeout: 15_000})
    await page.getByText('to-delete').waitFor({state: 'visible', timeout: 5_000})

    await page.getByRole('button', {name: 'Allow'}).click()
    await page.getByText('to-delete').waitFor({state: 'detached', timeout: 15_000})
    await page.close()
  })
})
