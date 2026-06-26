import {dirname} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import getPort from 'get-port'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {plugin as ws} from 'crossws/server'
import type {Sync} from '@mandarax/core/sync'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

type Esbuild = {build: (opts: Record<string, unknown>) => Promise<{outputFiles: Array<{text: string}>}>}

// `?inline` CSS imports are a Vite feature esbuild can't resolve; the canvas effect pulls in
// excalidraw + widget styles that way. Browser ITs assert rendered text/roles, not styling, so every
// `*.css?inline` import resolves to empty text.
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

// Bundle a browser fixture entry to a single IIFE string. esbuild is resolved from vite's install so
// no extra dep; node_modules paths cover the package + workspace root. react/react-dom are aliased to
// the package's single copy so the island and Excalidraw share ONE React instance (a second copy ->
// "invalid hook call"); the same dedupe the vite lib build does.
export async function bundleFixture(entry: string): Promise<string> {
  const viteEntry = require.resolve('vite', {paths: [here]})
  const esbuildPath = require.resolve('esbuild', {paths: [dirname(viteEntry)]})
  const esbuild: Esbuild = await import(pathToFileURL(esbuildPath).href)
  const reactDir = dirname(require.resolve('react', {paths: [here]}))
  const reactDomDir = dirname(require.resolve('react-dom', {paths: [here]}))
  const res = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    // Excalidraw branches on both flags; without IS_PREACT defined it throws at import.
    define: {'process.env.NODE_ENV': '"development"', 'process.env.IS_PREACT': '"false"'},
    alias: {react: reactDir, 'react-dom': reactDomDir},
    nodePaths: [`${here}/../../node_modules`, `${here}/../../../../node_modules`],
    plugins: [cssInlinePlugin],
  })
  const built = res.outputFiles[0]
  if (!built) throw new Error('esbuild produced no fixture output')
  return built.text
}

export function pageHtml(fixtureJs: string, core: string, body = ''): string {
  return `<!doctype html><html><head></head><body>${body}<script>window.__CORE__=${JSON.stringify(core)}</script><script>${fixtureJs}</script></body></html>`
}

export type PageServer = {base: string; close: () => Promise<void>}

// Serve one HTML page; when syncHooks are given, mount the sync ws relay so browser fixtures can join
// rooms over the same origin. A fresh getPort keeps parallel suites from colliding.
export async function servePage(html: string, syncHooks?: Sync['hooks']): Promise<PageServer> {
  const app = new H3()
  app.get('/', () => new Response(html, {headers: {'content-type': 'text/html'}}))
  const server: Server = serve({
    fetch: app.fetch,
    port: await getPort(),
    hostname: '127.0.0.1',
    plugins: syncHooks ? [ws(syncHooks)] : [],
  })
  await server.ready()
  return {base: new URL(server.url ?? '').origin, close: () => server.close()}
}
