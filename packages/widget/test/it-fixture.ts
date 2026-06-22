// Shared real-browser IT harness: builds the React fixture bundle, serves it with the widget, and
// drives the page tool over Playwright. Used by the page-driver IT suites so the scaffolding lives
// in one place; each suite keeps its own server routes + assertions.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import type {IncomingMessage, ServerResponse} from 'node:http'
import type {Page} from 'playwright'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// The widget now ships as an ES module + lazy chunks (no IIFE global), so ITs serve its dist dir and
// inject a module <script>; heavy chunks (the Excalidraw island, shiki langs) load on demand only.
const WIDGET_DIST = path.join(dirname, '../dist')
export const WIDGET_BASE = '/__mandarax_widget__/'
export const widgetScriptTag = `<script type="module" src="${WIDGET_BASE}mount.js"></script>`

const ASSET_CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.map': 'application/json',
  '.css': 'text/css',
}

// Serve a widget dist asset (mount.js + its lazy chunks) for any request under WIDGET_BASE; returns
// true if it handled the request. Each IT calls this first in its server handler. Confined to dist.
export function serveWidgetAsset(req: IncomingMessage, res: ServerResponse): boolean {
  const reqPath = (req.url ?? '').split('?')[0] ?? ''
  if (!reqPath.startsWith(WIDGET_BASE)) return false
  const file = path.join(WIDGET_DIST, reqPath.slice(WIDGET_BASE.length))
  if (file !== WIDGET_DIST && !file.startsWith(WIDGET_DIST + path.sep)) {
    res.statusCode = 403
    res.end('forbidden')
    return true
  }
  res.setHeader('content-type', ASSET_CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream')
  const stream = fs.createReadStream(file)
  stream.on('error', () => {
    res.statusCode = 404
    res.end('not found')
  })
  stream.pipe(res)
  return true
}

export async function buildFixture(): Promise<string> {
  const app = path.resolve(dirname, '../../../apps/examples/tanstack-start')
  const rdClient = require.resolve('react-dom/client', {paths: [app]})
  const nodeModules = rdClient.slice(0, rdClient.indexOf('/node_modules/react-dom/')) + '/node_modules'
  const viteEntry = require.resolve('vite', {paths: [dirname]})
  const esbuildPath = require.resolve('esbuild', {paths: [path.dirname(viteEntry)]})
  type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}
  const esbuild = (await import(pathToFileURL(esbuildPath).href)) as Esbuild
  const res = await esbuild.build({
    entryPoints: [path.join(dirname, 'fixtures/react-fixture.tsx')],
    bundle: true,
    format: 'iife',
    write: false,
    jsx: 'automatic',
    jsxImportSource: 'react',
    tsconfigRaw: '{}',
    define: {'process.env.NODE_ENV': '"development"'},
    nodePaths: [nodeModules],
  })
  const built = res.outputFiles[0]
  if (!built) throw new Error('esbuild produced no output')
  return built.text
}

// Widget module FIRST (installs the RDT hook), THEN the React fixture (so React connects to it).
// Both are module scripts so they execute in document order (a classic inline script would run
// before the deferred widget module and miss the hook).
export function fixturePage(fixtureJs: string): string {
  return `<!doctype html><html><head><meta name="pw-api-base" content=""></head><body>
    <div id="react-root"></div>
    ${widgetScriptTag}
    <script type="module">${fixtureJs}</script>
  </body></html>`
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

type Driver = {execute: (q: Record<string, unknown>) => Promise<Record<string, unknown>>}
export const drive = (page: Page, q: Record<string, unknown>): Promise<Record<string, unknown>> =>
  page.evaluate(
    (query) => (window as unknown as {__MANDARAX_PAGE_DRIVER__: Driver}).__MANDARAX_PAGE_DRIVER__.execute(query),
    q,
  )

// Fixture rendered (count visible) and the driver seam is live.
export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('#card-count')?.textContent === 'count: 7', undefined, {
    timeout: 15_000,
  })
  await page.waitForFunction(() => '__MANDARAX_PAGE_DRIVER__' in window, undefined, {timeout: 15_000})
}
