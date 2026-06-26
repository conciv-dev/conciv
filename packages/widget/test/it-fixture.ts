// Shared real-browser IT harness: builds the React fixture bundle, serves it with the widget, and
// drives the page tool over Playwright. Used by the page-driver IT suites so the scaffolding lives
// in one place; each suite keeps its own server routes + assertions.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import type {IncomingMessage} from 'node:http'
import type {Page} from 'playwright'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export const widgetBundle = fs.readFileSync(path.join(dirname, '../dist/mandarax-widget.global.js'), 'utf8')

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

// Widget script FIRST (installs the RDT hook), THEN the React fixture (so React connects to it).
export function fixturePage(fixtureJs: string): string {
  return `<!doctype html><html><head><meta name="pw-api-base" content=""></head><body>
    <div id="react-root"></div>
    <script>${widgetBundle}</script>
    <script>${fixtureJs}</script>
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
