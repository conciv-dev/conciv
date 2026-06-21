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
const PREVIEW_ID = 'preview-runtool-it'

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

// `?inline` CSS imports are a Vite feature; esbuild can't resolve them. The effects host pulls in
// styles.css?inline at module scope, but the rendered text (not styling) is what this IT asserts, so
// resolve every `*.css?inline` import to empty text.
const cssInlinePlugin = {
  name: 'css-inline',
  setup(build: {
    onResolve: (opts: {filter: RegExp}, cb: (args: {path: string}) => unknown) => void
    onLoad: (opts: {filter: RegExp; namespace: string}, cb: () => unknown) => void
  }): void {
    build.onResolve({filter: /\.css\?inline$/}, (args) => ({path: args.path, namespace: 'css-inline'}))
    build.onLoad({filter: /.*/, namespace: 'css-inline'}, () => ({contents: '', loader: 'text'}))
  },
}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/client-api-runtool-fixture.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    define: {'process.env.NODE_ENV': '"development"'},
    nodePaths: [join(here, '../node_modules'), join(here, '../../../node_modules')],
    plugins: [cssInlinePlugin],
  })
  const built = res.outputFiles[0]
  if (!built) throw new Error('esbuild produced no fixture output')
  return built.text
}

function pageHtml(fixtureJs: string, core: string): string {
  return `<!doctype html><html><head></head><body><ul id="rows"></ul><script>window.__CORE__=${JSON.stringify(core)};window.__PREVIEW_ID__=${JSON.stringify(PREVIEW_ID)}</script><script>${fixtureJs}</script></body></html>`
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
  const dir = mkdtempSync(join(tmpdir(), 'mx-runtool-'))
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

describe('client-api runTool + identity (it) — EffectCtx drives the real stack', () => {
  it('an effect calls ctx.runTool and reads ctx.previewId end to end', async () => {
    const page = await state.browser!.newPage()
    await page.goto(`${state.base}/`)
    await page.getByText(`preview ${PREVIEW_ID}`).waitFor({state: 'visible', timeout: 15_000})
    await page.getByText('effect-row').waitFor({state: 'visible', timeout: 15_000})
    await page.close()
  })
})
