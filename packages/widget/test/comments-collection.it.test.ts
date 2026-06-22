// The whiteboard comments collection, client half, end to end in a real browser: createClientDb +
// the native TrailBase adapter + the core proxy + real trail, with the comment schema/parse/serialize.
// Proves parse turns trail scalars (json string, unix int) into a structured Comment (array + Date)
// live, and that a server-side insert reconciles through the realtime subscription.
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
import {createLiveDb, createTrailSupervisor, registerDbProxy, type TrailSupervisor} from '@mandarax/core/db'
import {COMMENT_COLUMNS, CommentRecordSchema, type CommentRecord} from '@mandarax/whiteboard'
import type {ServerCollection} from '@mandarax/protocol/db-types'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

async function bundleFixture(): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const res = await esbuild.build({
    entryPoints: [join(here, 'fixtures/comments-collection-fixture.ts')],
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

const makeRecord = (text: string): CommentRecord => ({
  cid: crypto.randomUUID(),
  preview_id: 'preview-it',
  session_id: 'session-it',
  thread_id: crypto.randomUUID(),
  parent_id: null,
  parts: JSON.stringify([{type: 'text', text}]),
  author_kind: 'human',
  author_model: null,
  status: 'open',
  kind: 'floating',
  anchor: null,
  anchor_file: null,
  anchor_component: null,
  anchor_hash: null,
  last_resolved_commit: null,
  last_resolved_file_hash: null,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
  resolved_at: null,
  resolved_by: null,
})

const state: {
  browser?: Browser
  server?: Server
  sup?: TrailSupervisor
  dir?: string
  base: string
  comments?: ServerCollection<CommentRecord>
} = {base: ''}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mx-comments-'))
  state.dir = dir
  const trailPort = await getPort()
  const db = createLiveDb({trailBaseUrl: `http://localhost:${trailPort}`, dataDir: dir})
  state.comments = db.collection<CommentRecord>('comments', {
    schema: CommentRecordSchema,
    columns: COMMENT_COLUMNS,
    fts: ['parts'],
  })
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

describe('whiteboard comments collection (it) — real browser, real proxy, real trail', () => {
  it('renders a server comment with parsed parts and a Date created_at, reconciling live', async () => {
    const page = await state.browser!.newPage()
    await page.goto(state.base)
    await page.getByText('sync-ready').waitFor({state: 'visible', timeout: 15_000})

    await state.comments!.insert(makeRecord('first-comment'))
    await page.getByText('first-comment::date-ok').waitFor({state: 'visible', timeout: 15_000})

    await state.comments!.insert(makeRecord('second-comment'))
    await page.getByText('second-comment::date-ok').waitFor({state: 'visible', timeout: 15_000})
    await page.close()
  })
})
