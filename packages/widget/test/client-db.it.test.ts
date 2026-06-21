import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import getPort from 'get-port'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {chromium, type Browser} from 'playwright'
import {z} from 'zod'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {createLiveDb, createTrailSupervisor, registerDbProxy, type TrailSupervisor} from '@mandarax/core/db'
import type {ServerCollection} from '@mandarax/protocol/db-types'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const NoteSchema = z.object({cid: z.string(), body: z.string()})
type Note = z.infer<typeof NoteSchema>

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/client-db-fixture.ts')],
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
  return `<!doctype html><html><head></head><body><p id="status"></p><ul id="rows"></ul><script>${fixtureJs}</script></body></html>`
}

const state: {
  browser?: Browser
  server?: Server
  sup?: TrailSupervisor
  dir?: string
  base: string
  notes?: ServerCollection<Note>
} = {base: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-clientdb-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  state.notes = db.collection<Note>('notes', {schema: NoteSchema, columns: 'body TEXT NOT NULL', fts: ['body']})
  const sup = createTrailSupervisor({dataDir: dir, port: trailPort})
  state.sup = sup
  await sup.start()

  const fixtureJs = await bundleFixture()
  const html = pageHtml(fixtureJs)
  const app = new H3()
  registerDbProxy(app, sup.baseUrl)
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

describe('mx.db client (it) — real browser, real proxy, real trail', () => {
  it('renders an optimistic insert and reconciles a server-side insert live', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)

    await page.getByText('optimistic-row').waitFor({state: 'visible', timeout: 15_000})
    await page.getByText('sync-ready').waitFor({state: 'visible', timeout: 15_000})

    const cid = crypto.randomUUID()
    await state.notes!.insert({cid, body: 'server-row'})

    await page.getByText('server-row').waitFor({state: 'visible', timeout: 15_000})
    await page.close()
  })
})
