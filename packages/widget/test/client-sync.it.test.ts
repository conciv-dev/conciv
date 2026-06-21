import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import getPort from 'get-port'
import {H3, type H3Event} from 'h3'
import {serve, type Server} from 'srvx'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSyncEngine, registerSyncRelay} from '@mandarax/core/sync'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ROOM = 'preview:session'

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/client-sync-fixture.ts')],
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

function pageHtml(fixtureJs: string): string {
  return `<!doctype html><html><head></head><body><p id="status"></p><p id="value"></p><script>${fixtureJs}</script></body></html>`
}

const state: {browser?: Browser; server?: Server; sup?: TrailSupervisor; dir?: string; base: string} = {base: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-clientsync-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const engine = createSyncEngine({store: createSnapshotStore(db)})
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  state.sup = sup
  await sup.start()

  const html = pageHtml(await bundleFixture())
  const app = new H3()
  const validateRoom = (room: string, event: H3Event): boolean =>
    room === ROOM && event.req.headers.get(MANDARAX_SESSION_HEADER) === 'tok'
  registerSyncRelay(app, engine, validateRoom)
  app.get('/', () => new Response(html, {headers: {'content-type': 'text/html'}}))
  const server = serve({fetch: app.fetch, port: await getPort(), hostname: '127.0.0.1'})
  state.server = server
  await server.ready()
  state.base = new URL(server.url ?? '').origin
  state.browser = await chromium.launch()
}, 90_000)

afterAll(async () => {
  await state.browser?.close()
  await state.server?.close()
  await state.sup?.stop()
  if (state.dir) rmSync(state.dir, {recursive: true, force: true})
})

describe('mx.sync client (it) — real browsers converge through the core relay', () => {
  it('propagates one page write to another and rehydrates on reload', async () => {
    const reader = await state.browser!.newPage()
    await reader.goto(state.base)
    await reader.getByText('reader-ready').waitFor({state: 'visible', timeout: 15_000})

    const writer = await state.browser!.newPage()
    await writer.goto(`${state.base}/?write=hello-canvas`)

    await reader.getByText('hello-canvas').waitFor({state: 'visible', timeout: 15_000})
    await writer.close()

    await reader.reload()
    await reader.getByText('hello-canvas').waitFor({state: 'visible', timeout: 15_000})
    await reader.close()
  })
})
