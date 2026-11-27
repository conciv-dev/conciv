import {log} from 'evlog'
import {dirname, isAbsolute, join, posix, relative, resolve, sep} from 'node:path'
import {access, readFile, writeFile} from 'node:fs/promises'
import type {Plugin, ViteDevServer} from 'vite'
import {concivStateDir, createConcivStateDir} from '@conciv/types/state-types'
import type {Engine, LogEntry} from '@conciv/backend/start'
import type {ConcivConfig, ConcivSettingsInit, LogLevel} from '@conciv/types/config-types'
import {installConcivBinShim} from './bin-shim.js'
import {readEngineLine} from './engine-log.js'
import {htmlTags, makeWidgetInject} from './widget-middleware.js'
import {WIDGET_DOCK_ROUTE, WIDGET_ROUTE, loadWidgetModule, resolveWidgetModule} from './widget-module.js'
import {makeOpenInEditor} from './open-editor.js'
import {makeViteBridge} from './vite-bridge.js'
import {createShutdownTracker, install as installShutdownDeadline} from './shutdown-deadline.js'
import type {Builtins} from './boot.js'
import {addSourceToJsx} from '@tanstack/devtools-bundler-core'

const UNSTAMPED_PATHS = ['?raw', '/dist/', '/build/', 'node_modules']

const SOLID_SINGLETONS = [
  'solid-js',
  'solid-js/web',
  'solid-js/store',
  '@tanstack/solid-router',
  '@ark-ui/solid',
  '@conciv/backend-plugin-api',
]

function readPackageName(id: string): string {
  const segments = id.split('/')
  return id.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? id)
}

async function resolvableFrom(id: string, dir: string): Promise<boolean> {
  const found = await access(join(dir, 'node_modules', readPackageName(id), 'package.json')).then(
    () => true,
    () => false,
  )
  if (found) return true
  const parent = dirname(dir)
  if (parent === dir) return false
  return resolvableFrom(id, parent)
}

async function concivSolidConfig(opts: {root?: string; warmupFiles?: readonly string[]} = {}) {
  const root = opts.root
  const resolvable = await Promise.all(
    SOLID_SINGLETONS.map(async (id) => (root === undefined || (await resolvableFrom(id, root)) ? id : null)),
  )
  const singletons = resolvable.filter((id) => id !== null)
  return {
    resolve: {dedupe: singletons},
    optimizeDeps: {
      exclude: singletons,
      include: [],
    },
    server: {forwardConsole: false, warmup: {clientFiles: [...(opts.warmupFiles ?? [])]}},
  }
}

function dropIncludedFromExcludes(
  optimizeDeps: {include?: string[]; exclude?: string[]} | undefined,
  managedIds: readonly string[],
): void {
  if (!optimizeDeps?.exclude?.length) return
  const included = new Set(optimizeDeps.include ?? [])
  const managed = new Set(managedIds)
  optimizeDeps.exclude = optimizeDeps.exclude.filter((id) => !(managed.has(id) && included.has(id)))
}

const GLOB_SPECIAL = /[\\()[\]{}*?!]/g
const DEFAULT_SCAN_ENTRIES = ['**/*.html', '!**/__tests__/**', '!**/coverage/**']

function escapeGlob(file: string): string {
  return file.split(sep).join(posix.sep).replaceAll(GLOB_SPECIAL, '\\$&')
}

function readImportPath(from: string, file: string): string {
  const path = relative(from, file).split(sep).join(posix.sep)
  return path.startsWith('../') ? path : `./${path}`
}

async function writeScanEntry(root: string, files: readonly string[]): Promise<readonly string[]> {
  const stateDir = concivStateDir(root)
  const path = join(stateDir, 'widget-scan-entry.gen.js')
  const source = files.map((file) => `import ${JSON.stringify(readImportPath(stateDir, file))}\n`).join('')
  try {
    await createConcivStateDir(stateDir)
    await writeFile(path, source, 'utf8')
    return [path]
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    log.warn({
      action: 'unplugin',
      message: `could not write the file, so vite's dependency scan may miss a widget file in an ignored folder: ${cause}`,
      path,
    })
    return files
  }
}

async function readInputFiles(input: unknown, root: string): Promise<string[] | undefined> {
  const values = typeof input === 'string' ? [input] : Array.isArray(input) ? input : Object.values(input ?? {})
  const files = values.map((value) =>
    typeof value === 'string' && isAbsolute(value) ? value : join(root, String(value)),
  )
  const found = await Promise.all(
    files.map((file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    ),
  )
  return found.every(Boolean) ? files : undefined
}

type ScanConfig = {
  optimizeDeps?: {entries?: string | string[]}
  input?: unknown
  build?: {rolldownOptions?: {input?: unknown}; rollupOptions?: {input?: unknown}}
}

function readAppInput(config: ScanConfig): unknown {
  const build = config.build ?? {}
  return config.input ?? build.rolldownOptions?.input ?? build.rollupOptions?.input
}

async function addScanEntries(
  config: ScanConfig,
  root: string,
  files: readonly string[],
): Promise<string[] | undefined> {
  if (files.length === 0) return undefined
  const patterns = (await writeScanEntry(root, files)).map(escapeGlob)
  if (config.optimizeDeps?.entries !== undefined) return patterns
  const input = readAppInput(config)
  if (input === undefined) return [...DEFAULT_SCAN_ENTRIES, ...patterns]
  const inputFiles = await readInputFiles(input, root)
  return inputFiles === undefined ? undefined : [...inputFiles.map(escapeGlob), ...patterns]
}

function stampJsxSource(code: string, id: string): ReturnType<typeof addSourceToJsx> | null {
  if (UNSTAMPED_PATHS.some((part) => id.includes(part))) return null
  return addSourceToJsx(code, id) ?? null
}

function mountWidget(
  server: ViteDevServer,
  apiBase: string,
  widgetConfig: ConcivSettingsInit | false | undefined,
): void {
  server.middlewares.stack.unshift({
    route: '',
    handle: makeWidgetInject(apiBase, widgetConfig),
  })
}

function devOrigins(server: ViteDevServer): string[] {
  const urls = [...(server.resolvedUrls?.local ?? []), ...(server.resolvedUrls?.network ?? [])]
  return [...new Set(urls.map((u) => safeOrigin(u)).filter((o): o is string => o !== null))]
}
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const viteLevels = {
  trace: 'info',
  debug: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
} satisfies Record<LogEntry['level'], 'info' | 'warn' | 'error'>

function writeEngineLog(server: ViteDevServer, entry: LogEntry): void {
  const line = readEngineLine(entry)
  if (line !== undefined) server.config.logger[viteLevels[entry.level]](line)
}

async function bootEngine(
  server: ViteDevServer,
  options: ConcivConfig,
  agentPath: string,
  widgetPageDir: string | undefined,
): Promise<Engine> {
  const {start} = await import('@conciv/backend/start')
  return start({
    options,
    root: server.config.root,
    port: options.port === undefined ? undefined : {preferred: options.port},
    bridge: await makeViteBridge(server),
    launchEditor: makeOpenInEditor(server.config.root),
    allowedOrigins: devOrigins(server),
    widgetPageDir,
    devEndpointDir: options.devEndpointDir,
    homeDir: options.homeDir,
    log: {emit: (entry) => writeEngineLog(server, entry)},
    childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
  })
}

function reloadAfterBundlerChange(server: ViteDevServer) {
  for (const environment of Object.values(server.environments)) environment.moduleGraph.invalidateAll()
  server.environments.client.hot.send({type: 'full-reload', path: '*'})
}

function stopWhenHttpServerCloses(server: ViteDevServer, engine: Engine): Engine {
  const closing = Promise.withResolvers<void>()
  const stopped = closing.promise
    .then(() => engine.stop())
    .catch((error: unknown) => log.error({action: 'unplugin', message: 'stopping the engine failed', error}))
  server.httpServer?.once('close', () => closing.resolve())
  return {
    ...engine,
    stop: () => {
      closing.resolve()
      return stopped
    },
  }
}

const EMBED_LATE_DISCOVERED_DEPENDENCIES = [
  '@conciv/solid-diffs > @pierre/diffs > lru_map',
  '@conciv/ui-kit-chat > mermaid > @braintree/sanitize-url',
  '@conciv/ui-kit-chat > mermaid > cytoscape-cose-bilkent',
  '@conciv/ui-kit-chat > mermaid > cytoscape-fcose',
  '@conciv/ui-kit-chat > mermaid > dayjs',
  '@conciv/ui-kit-chat > mermaid > dayjs/plugin/advancedFormat.js',
  '@conciv/ui-kit-chat > mermaid > dayjs/plugin/customParseFormat.js',
  '@conciv/ui-kit-chat > mermaid > dayjs/plugin/duration.js',
  '@conciv/ui-kit-chat > mermaid > dayjs/plugin/isoWeek.js',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/css',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/diff',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/go',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/html',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/javascript',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/json',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/jsx',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/markdown',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/python',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/rust',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/scss',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/sql',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/tsx',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/typescript',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/yaml',
  '@conciv/ui-kit-chat > shiki/engine/javascript',
  '@conciv/ui-kit-chat > shiki/langs/bash.mjs',
  '@conciv/ui-kit-chat > shiki/core',
  '@conciv/ui-kit-chat > @chenglou/pretext',
  '@conciv/ui-kit-tap > @tiptap/suggestion',
  '@conciv/ui-kit-terminal > @xterm/xterm',
  '@conciv/ui-kit-terminal > @xterm/addon-fit',
  '@conciv/solid-streamdown > marked',
  '@conciv/solid-streamdown > rehype-harden',
  '@conciv/solid-streamdown > rehype-raw',
  '@conciv/solid-streamdown > rehype-sanitize',
  '@conciv/solid-streamdown > remark-gfm',
  '@conciv/solid-streamdown > remark-parse',
  '@conciv/solid-streamdown > remark-rehype',
  '@conciv/solid-streamdown > remend',
  '@conciv/solid-streamdown > unified',
  '@conciv/solid-diffs > @pierre/diffs',
  '@conciv/solid-diffs > @pierre/diffs/worker',
  '@conciv/solid-diffs > @tanstack/solid-pacer',
  '@conciv/mascot > gsap',
  '@conciv/mascot > gsap/MotionPathPlugin',
].map((chain) => `@conciv/it > @conciv/app > ${chain}`)

const EMBED_SOLID_RUNTIME = ['solid-js', 'solid-js/web', 'solid-js/store']

async function readMountChunk(embedEntry: string): Promise<string[]> {
  try {
    const chunk = /import\(\s*["']\.\/(mount-impl-[\w-]+\.js)["']\s*\)/.exec(await readFile(embedEntry, 'utf8'))?.[1]
    return chunk === undefined ? [] : [join(dirname(embedEntry), chunk)]
  } catch {
    return []
  }
}

const CONCIV_MARK_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0iI0Q3MjYzRCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJjb25jaXYiPjx0aXRsZT5jb25jaXY8L3RpdGxlPjxwYXRoIGQ9Ik0xNS4xIDE0LjYzSDQ4LjlBNi4zMiA2LjMyIDAgMCAxIDU1LjIyIDIwLjk1VjQzLjY1QTYuMzIgNi4zMiAwIDAgMSA0OC45IDQ5Ljk3SDI3LjM5TDE4IDU4LjE3TDE4IDQ5Ljk3SDE1LjFBNi4zMiA2LjMyIDAgMCAxIDguNzggNDMuNjVWMjAuOTVBNi4zMiA2LjMyIDAgMCAxIDE1LjEgMTQuNjNaTTUuMDY1IDI2LjI5Mkg1LjA2NUEyLjA5IDIuMDkgMCAwIDEgNy4xNTUgMjguMzgyVjM2LjIxOEEyLjA5IDIuMDkgMCAwIDEgNS4wNjUgMzguMzA4SDUuMDY1QTIuMDkgMi4wOSAwIDAgMSAyLjk3NSAzNi4yMThWMjguMzgyQTIuMDkgMi4wOSAwIDAgMSA1LjA2NSAyNi4yOTJaTTU4LjkzNSAyNi4yOTJINTguOTM1QTIuMDkgMi4wOSAwIDAgMSA2MS4wMjUgMjguMzgyVjM2LjIxOEEyLjA5IDIuMDkgMCAwIDEgNTguOTM1IDM4LjMwOEg1OC45MzVBMi4wOSAyLjA5IDAgMCAxIDU2Ljg0NSAzNi4yMThWMjguMzgyQTIuMDkgMi4wOSAwIDAgMSA1OC45MzUgMjYuMjkyWk00MS44MTUgNC45TDQ0LjIwNSA0LjlMNDQuMjA1IDE2LjYzTDQxLjgxNSAxNi42M1pNNDAuMDIgNC45QTIuOTkgMi45OSAwIDEgMSA0NiA0LjlBMi45OSAyLjk5IDAgMSAxIDQwLjAyIDQuOVpNMTguMDYgMjUuMzRMMjQuOTIxIDMyLjMxTDE4LjA2IDM5LjI4TDIwLjk2IDQyLjE4TDMwLjcxOSAzMi4zMUwyMC45NiAyMi40NFpNMzIuNTEgMzguNkwzMi41MSA0Mi4xOEw0NiA0Mi4xOEw0NiAzOC42WiIvPjwvc3ZnPg=='

type DevToolsContext = {
  docks: {
    register: (entry: {
      id: string
      title: string
      icon: string
      type: 'custom-render'
      renderer: {importFrom: string; importName: string}
    }) => void
  }
  rpc: {
    register: (definition: {name: string; type: 'action'; handler: () => Promise<string>}) => void
  }
}

type DevToolsPlugin = Plugin & {
  devtools: {setup: (context: DevToolsContext) => void}
  api: {engine: () => Engine | undefined}
}

function widgetSettings(widget: ConcivConfig['widget'], docked: boolean): ConcivSettingsInit | false | undefined {
  if (widget === false || !docked) return widget
  return {...widget, launcher: false, defaultOpen: true, surface: 'dock'}
}

export function makeViteHook(
  options: ConcivConfig = {},
  builtins: Builtins = {},
  logLevel: LogLevel = 'off',
): DevToolsPlugin {
  const engines: Engine[] = []
  const deadlines: (() => void)[] = []
  const shutdown = createShutdownTracker()
  let apiBase: string | undefined

  let managedExcludes: string[] = []
  let widgetFiles: string[] = []
  let projectRoot = process.cwd()
  let docked = false
  let devServer: ViteDevServer | undefined
  let testing = false
  return {
    name: 'conciv',
    apply: 'serve',
    enforce: 'pre',
    api: {engine: () => engines.at(-1)},
    devtools: {
      setup(context) {
        if (!docked) return
        context.docks.register({
          id: 'conciv',
          title: 'conciv',
          icon: CONCIV_MARK_URI,
          type: 'custom-render',
          renderer: {importFrom: WIDGET_DOCK_ROUTE, importName: 'default'},
        })
        context.rpc.register({
          name: 'conciv:engine-token',
          type: 'action',
          handler: async () => {
            const engine = engines.at(-1)
            if (!engine || !devServer) throw new Error('the conciv engine has not started yet')
            return engine.trustBrowser(
              {browser: 'via Vite DevTools', origin: devOrigins(devServer)[0] ?? 'Vite DevTools'},
              Date.now(),
            )
          },
        })
      },
    },
    async config(userConfig, env) {
      if (env.mode === 'test') return {}
      const embedFiles =
        builtins.embedEntry === undefined ? [] : [builtins.embedEntry, ...(await readMountChunk(builtins.embedEntry))]
      projectRoot = resolve(userConfig.root ?? process.cwd())
      widgetFiles = env.command === 'serve' ? embedFiles : []
      const base = await concivSolidConfig({
        root: projectRoot,
        warmupFiles: embedFiles,
      })
      base.optimizeDeps.exclude.push('@conciv/app')
      managedExcludes = [...base.optimizeDeps.exclude]
      return {
        ...base,
        optimizeDeps: {
          ...base.optimizeDeps,
          include: [
            ...base.optimizeDeps.include,
            ...EMBED_SOLID_RUNTIME.filter((id) => !base.optimizeDeps.exclude.includes(id)).map(
              (id) => `@conciv/it > @conciv/app > ${id}`,
            ),
            ...EMBED_LATE_DISCOVERED_DEPENDENCIES,
          ],
        },
      }
    },
    async configEnvironment(name, environmentConfig) {
      dropIncludedFromExcludes(environmentConfig.optimizeDeps, managedExcludes)
      if (name !== 'client') return
      const entries = await addScanEntries(environmentConfig, projectRoot, widgetFiles)
      return entries === undefined ? undefined : {optimizeDeps: {entries}}
    },
    async configResolved(config) {
      testing = config.mode === 'test'
      if (testing) return
      const {resolveConfig} = await import('@conciv/backend-defaults/backend')
      docked =
        options.widget !== false &&
        resolveConfig(options, config.root).enabled &&
        config.plugins.some((plugin) => plugin.name === 'vite:devtools')
    },
    resolveId(id) {
      return resolveWidgetModule(id)
    },
    load(id) {
      return loadWidgetModule(id, {apiBase, embedEntry: builtins.embedEntry ?? '@conciv/app', logLevel})
    },
    transform(code, id) {
      if (options.enabled === false || testing) return null
      return stampJsxSource(code, id)
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(_html, ctx) {
        const {resolveConfig} = await import('@conciv/backend-defaults/backend')
        const cfg = resolveConfig(options, ctx.server?.config.root ?? process.cwd())
        const engine = engines.at(-1)
        if (!cfg.enabled || !engine) return []
        return htmlTags(engine.port, {
          widget: widgetSettings(options.widget, docked),
          entry: docked ? WIDGET_DOCK_ROUTE : WIDGET_ROUTE,
        })
      },
    },
    async configureServer(server: ViteDevServer) {
      if (testing) return
      const {resolveConfig} = await import('@conciv/backend-defaults/backend')
      const cfg = resolveConfig(options, server.config.root)
      if (!cfg.enabled) return
      const booted = await bootEngine(
        server,
        options,
        await installConcivBinShim(concivStateDir(cfg.stateRoot)),
        builtins.widgetPageDir,
      )
      booted.bundler.changes(() => reloadAfterBundlerChange(server))
      engines.push(stopWhenHttpServerCloses(server, booted))
      if (!server.config.server.middlewareMode) deadlines.push(installShutdownDeadline(shutdown))
      apiBase = `http://127.0.0.1:${booted.port}`
      devServer = server
      mountWidget(server, apiBase, options.widget)
    },
    async closeServer() {
      const settle = shutdown.track('conciv engine stopping')
      await engines.shift()?.stop()
      settle()
      deadlines.shift()?.()
    },
  }
}
