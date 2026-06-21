import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import getPort from 'get-port'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {plugin as ws} from 'crossws/server'
import {chromium, type Browser} from 'playwright'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, type TrailSupervisor} from '@mandarax/core/db'
import {createSnapshotStore, createSync} from '@mandarax/core/sync'
import type {SyncEngine} from '@mandarax/protocol/sync-types'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/sync-awareness-fixture.ts')],
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

const state: {
  browser?: Browser
  server?: Server
  sup?: TrailSupervisor
  dir?: string
  engine?: SyncEngine
  base: string
} = {base: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-awareness-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  const sync = createSync({store: createSnapshotStore(db)})
  state.engine = sync.engine
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  state.sup = sup
  await sup.start()

  const html = pageHtml(await bundleFixture())
  const app = new H3()
  app.get('/', () => new Response(html, {headers: {'content-type': 'text/html'}}))
  const server = serve({fetch: app.fetch, port: await getPort(), hostname: '127.0.0.1', plugins: [ws(sync.hooks)]})
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

describe('mx.sync awareness (it) — cursors propagate through the relay', () => {
  it('surfaces a remote awareness cursor on another page and exposes a server-side Awareness handle', async () => {
    const reader = await state.browser!.newPage()
    await reader.goto(state.base)
    await reader.getByText('reader-ready').waitFor({state: 'visible', timeout: 15_000})

    const writer = await state.browser!.newPage()
    await writer.goto(`${state.base}/?setcursor=10,20`)

    await reader.getByText('cursor 10,20').waitFor({state: 'visible', timeout: 15_000})
    await writer.close()
    await reader.close()

    const serverAwareness = state.engine!.room('aw-room').awareness
    expect(serverAwareness).toBeDefined()
    expect(typeof serverAwareness.setLocalStateField).toBe('function')
    expect(typeof serverAwareness.getStates).toBe('function')
  })
})
