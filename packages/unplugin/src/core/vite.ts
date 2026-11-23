import {dirname, join} from 'node:path'
import {readFileSync, existsSync} from 'node:fs'
import type {Plugin, ViteDevServer} from 'vite'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {Engine, LogEntry} from '@conciv/core/start'
import type {ConcivConfig, ConcivSettingsInit} from '@conciv/protocol/config-types'
import {installConcivBinShim} from './bin-shim.js'
import {readEngineLine} from './engine-log.js'
import {htmlTags, makeWidgetInject} from './widget-middleware.js'
import {WIDGET_DOCK_ROUTE, WIDGET_ROUTE, loadWidgetModule, resolveWidgetModule} from './widget-module.js'
import {makeOpenInEditor} from './open-editor.js'
import {makeViteBridge} from './vite-bridge.js'
import {install as installShutdownDeadline, track} from './shutdown-deadline.js'
import type {Builtins} from './boot.js'
import {addSourceToJsx} from '@tanstack/devtools-bundler-core'

const UNSTAMPED_PATHS = ['?raw', '/dist/', '/build/', 'node_modules']

const SOLID_SINGLETONS = [
  'solid-js',
  'solid-js/web',
  'solid-js/store',
  '@tanstack/solid-router',
  '@ark-ui/solid',
  '@conciv/plugin',
]

function readPackageName(id: string): string {
  const segments = id.split('/')
  return id.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? id)
}

function resolvableFrom(id: string, root: string): boolean {
  let dir = root
  while (true) {
    if (existsSync(join(dir, 'node_modules', readPackageName(id), 'package.json'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

function concivSolidConfig(opts: {root?: string; warmupFiles?: readonly string[]} = {}) {
  const root = opts.root
  const singletons =
    root === undefined ? [...SOLID_SINGLETONS] : SOLID_SINGLETONS.filter((id) => resolvableFrom(id, root))
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
  nativePageDir: string | undefined,
): Promise<Engine> {
  const {start} = await import('@conciv/core/start')
  return start({
    options,
    root: server.config.root,
    port: options.port === undefined ? undefined : {preferred: options.port},
    bridge: await makeViteBridge(server),
    launchEditor: makeOpenInEditor(server.config.root),
    allowedOrigins: devOrigins(server),
    nativePageDir,
    devEndpointDir: options.devEndpointDir,
    homeDir: options.homeDir,
    log: {emit: (entry) => writeEngineLog(server, entry)},
    childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
  })
}

function stopWhenHttpServerCloses(server: ViteDevServer, engine: Engine): Engine {
  const closing = Promise.withResolvers<void>()
  const stopped = closing.promise
    .then(() => engine.stop())
    .catch((error: unknown) => console.error('conciv: stopping the engine failed', error))
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
  '@conciv/ui-kit-chat > @conciv/ai > @tanstack/ai > partial-json',
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
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/html',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/javascript',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/json',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/jsx',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/markdown',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/tsx',
  '@conciv/ui-kit-chat > @shikijs/langs-precompiled/typescript',
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
  'bippy',
  'bippy/source',
  'react-grab',
].map((chain) => `@conciv/it > @conciv/embed > ${chain}`)

const EMBED_SOLID_RUNTIME = ['solid-js', 'solid-js/web', 'solid-js/store']

function readMountChunk(embedEntry: string): string[] {
  try {
    const chunk = /import\(\s*["']\.\/(mount-impl-[\w-]+\.js)["']\s*\)/.exec(readFileSync(embedEntry, 'utf8'))?.[1]
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
    register: (definition: {name: string; type: 'action'; handler: () => string}) => void
  }
}

type DevToolsPlugin = Plugin & {devtools: {setup: (context: DevToolsContext) => void}}

function widgetSettings(widget: ConcivConfig['widget'], docked: boolean): ConcivSettingsInit | false | undefined {
  if (widget === false || !docked) return widget
  return {...widget, launcher: false, defaultOpen: true, surface: 'dock'}
}

export function makeViteHook(options: ConcivConfig = {}, builtins: Builtins = {}): DevToolsPlugin {
  const engines: Engine[] = []
  const deadlines: (() => void)[] = []
  let apiBase: string | undefined

  let managedExcludes: string[] = []
  let docked = false
  let devServer: ViteDevServer | undefined
  let testing = false
  return {
    name: 'conciv',
    apply: 'serve',
    enforce: 'pre',
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
          handler: () => {
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
    config(userConfig, env) {
      if (env.mode === 'test') return {}
      const embedFiles =
        builtins.embedEntry === undefined ? [] : [builtins.embedEntry, ...readMountChunk(builtins.embedEntry)]
      const base = concivSolidConfig({
        root: userConfig.root ?? process.cwd(),
        warmupFiles: embedFiles,
      })
      base.optimizeDeps.exclude.push('@conciv/embed')
      managedExcludes = [...base.optimizeDeps.exclude]
      return {
        ...base,
        optimizeDeps: {
          ...base.optimizeDeps,
          include: [
            ...base.optimizeDeps.include,
            ...EMBED_SOLID_RUNTIME.filter((id) => !base.optimizeDeps.exclude.includes(id)).map(
              (id) => `@conciv/it > @conciv/embed > ${id}`,
            ),
            ...EMBED_LATE_DISCOVERED_DEPENDENCIES,
          ],
        },
      }
    },
    configEnvironment(_name, environmentConfig) {
      dropIncludedFromExcludes(environmentConfig.optimizeDeps, managedExcludes)
    },
    async configResolved(config) {
      testing = config.mode === 'test'
      if (testing) return
      const {resolveConfig} = await import('@conciv/core/config')
      docked =
        options.widget !== false &&
        resolveConfig(options, config.root).enabled &&
        config.plugins.some((plugin) => plugin.name === 'vite:devtools')
    },
    resolveId(id) {
      return resolveWidgetModule(id)
    },
    load(id) {
      return loadWidgetModule(id, apiBase, builtins.embedEntry)
    },
    transform(code, id) {
      if (options.enabled === false || testing) return null
      return stampJsxSource(code, id)
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(_html, ctx) {
        const {resolveConfig} = await import('@conciv/core/config')
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
      const {resolveConfig} = await import('@conciv/core/config')
      const cfg = resolveConfig(options, server.config.root)
      if (!cfg.enabled) return
      const booted = await bootEngine(
        server,
        options,
        installConcivBinShim(concivStateDir(cfg.stateRoot)),
        builtins.nativePageDir,
      )
      engines.push(stopWhenHttpServerCloses(server, booted))
      if (!server.config.server.middlewareMode) deadlines.push(installShutdownDeadline())
      apiBase = `http://127.0.0.1:${booted.port}`
      devServer = server
      mountWidget(server, apiBase, options.widget)
    },
    async closeServer() {
      const settle = track('conciv engine stopping')
      await engines.shift()?.stop()
      settle()
      deadlines.shift()?.()
    },
  }
}
