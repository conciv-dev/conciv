import {globSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import getPort from 'get-port'
import {serve, type Server} from 'srvx'
import {createGenerator} from 'unocss'
import {presetAidx} from '@mandarax/uno-preset'
import {build, type PluginOption} from 'vite'
import solid from 'vite-plugin-solid'
import wasmPlugin from 'vite-plugin-wasm'

const wasm = wasmPlugin as unknown as () => PluginOption

const here = dirname(fileURLToPath(import.meta.url))

// The real production stylesheet for the surface: UnoCSS over the whiteboard src with the shared
// preset — the same pw-* utilities the widget generates and injects into the surface shadow root.
export async function generateShadowCss(): Promise<string> {
  const root = join(here, '..', '..')
  const files = globSync('src/**/*.{ts,tsx}', {cwd: root})
  const content = files.map((file) => readFileSync(join(root, file), 'utf8')).join('\n')
  const generator = await createGenerator({presets: [presetAidx()]})
  const {css} = await generator.generate(content)
  return css
}

export type BuiltFixture = {dir: string}

export async function buildSolidFixture(entry: string): Promise<BuiltFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'mx-whiteboard-fixture-'))
  await build({
    root: join(here, '..'),
    logLevel: 'silent',
    plugins: [solid(), wasm()],
    resolve: {dedupe: ['react', 'react-dom', 'solid-js']},
    define: {'process.env.NODE_ENV': JSON.stringify('development'), 'process.env.IS_PREACT': JSON.stringify('false')},
    build: {
      outDir: dir,
      emptyOutDir: true,
      target: 'esnext',
      minify: false,
      modulePreload: false,
      rollupOptions: {
        input: entry,
        output: {
          format: 'es',
          entryFileNames: 'fixture.js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name][extname]',
        },
      },
    },
  })
  return {dir}
}

export type FixturePage = {base: string; close: () => Promise<void>}

export async function serveBuiltFixture(
  built: BuiltFixture,
  core: string,
  body = '',
  shadowCss = '',
): Promise<FixturePage> {
  const html = `<!doctype html><html><head></head><body>${body}<script>window.__CORE__=${JSON.stringify(core)}</script><script>window.__SHADOW_CSS__=${JSON.stringify(shadowCss)}</script><script type="module" src="/fixture.js"></script></body></html>`
  const fetchHandler = async (request: Request): Promise<Response> => {
    const pathname = new URL(request.url).pathname
    if (pathname === '/') return new Response(html, {headers: {'content-type': 'text/html'}})
    const path = normalize(join(built.dir, pathname))
    if (!path.startsWith(built.dir)) return new Response('forbidden', {status: 403})
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) return new Response('not found', {status: 404})
    return new Response(await readFile(path), {headers: {'content-type': contentType(path)}})
  }
  const server: Server = serve({fetch: fetchHandler, port: await getPort(), hostname: '127.0.0.1'})
  await server.ready()
  return {base: new URL(server.url ?? '').origin, close: () => server.close()}
}

const contentType = (path: string): string => {
  if (path.endsWith('.js')) return 'text/javascript'
  if (path.endsWith('.wasm')) return 'application/wasm'
  if (path.endsWith('.css')) return 'text/css'
  return 'application/octet-stream'
}

export const removeFixtureDir = (built: BuiltFixture): void => rmSync(built.dir, {recursive: true, force: true})
