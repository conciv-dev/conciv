import {dirname, join} from 'node:path'
import {readdirSync} from 'node:fs'
import type {IncomingMessage, ServerResponse} from 'node:http'
import type {ErrorPayload, Plugin, ViteDevServer} from 'vite'
import {defineBundlerBridge, type BundlerBridge, type BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {Engine} from '@conciv/core/start'
import {resolveConfig} from '@conciv/core/config'
import type {ConcivConfig, ConcivSettingsInit} from '@conciv/protocol/config-types'
import {installConcivBinShim} from './bin-shim.js'
import {isHubPath, isLoopback} from './dev-server-hub.js'
import {viteConfig, viteResolve, viteGraph, viteTransform, viteUrls, type ViteLike} from './vite-tools.js'
import {EXTENSIONS_ROUTE, htmlTags, makeWidgetInject} from './widget-middleware.js'
import {makeOpenInEditor} from './open-editor.js'
import {type Builtins, NO_BUILTINS, loadServerExtensions} from '@conciv/extension-compiler/extensions'
import {
  loadExtensionsModule,
  concivSolidConfig,
  dropIncludedFromExcludes,
  resolveExtensionsModule,
  transformConcivModule,
} from '@conciv/extension-compiler/vite-plumbing'

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'error' && 'err' in value
}

function makeDiagnosticSubscribe(server: ViteLike): (listener: (diagnostic: BundlerDiagnostic) => void) => () => void {
  const listeners = new Set<(diagnostic: BundlerDiagnostic) => void>()
  const emit = (diagnostic: BundlerDiagnostic): void => {
    for (const listener of listeners) listener(diagnostic)
  }
  let installed = false
  const install = (): void => {
    if (installed) return
    installed = true
    const clientHot = server.environments.client.hot
    const forward = clientHot.send
    clientHot.send = (...args: unknown[]): void => {
      const [first] = args
      if (isErrorPayload(first)) {
        const err = first.err
        const loc = err.loc
        emit({
          kind: 'build-error',
          message: err.message,
          file: typeof err.id === 'string' ? err.id : (loc?.file ?? null),
          loc: loc ? {line: loc.line, column: loc.column} : null,
          timestamp: Date.now(),
        })
      }
      Reflect.apply(forward, clientHot, args)
    }
    server.watcher.on('change', (file) => emit({kind: 'hmr-update', file, timestamp: Date.now()}))
    server.middlewares.stack.unshift({
      route: '',
      handle: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void): void => {
        const startedAt = Date.now()
        const method = req.method ?? 'GET'
        const url = req.url ?? ''
        res.once('finish', () =>
          emit({
            kind: 'request-trace',
            method,
            url,
            status: res.statusCode,
            durationMs: Date.now() - startedAt,
            timestamp: Date.now(),
          }),
        )
        next()
      },
    })
  }
  return (listener) => {
    install()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
}

export function makeViteBridge(server: ViteLike): BundlerBridge {
  return defineBundlerBridge({
    id: 'vite',
    config: () => viteConfig(server),
    resolve: (spec, importer) => viteResolve(server, spec, importer),
    moduleGraph: (file) => viteGraph(server, file),
    transform: (url) => viteTransform(server, url),
    urls: () => viteUrls(server),
    reload: async (file) => {
      const mods = server.moduleGraph.getModulesByFile(file)
      if (mods && server.reloadModule) for (const m of mods) await server.reloadModule(m)
    },
    restart: async (force) => {
      await server.restart?.(force)
    },
    subscribe: makeDiagnosticSubscribe(server),
  })
}

function mountWidget(
  server: ViteDevServer,
  apiBase: string,
  widgetConfig: () => ConcivSettingsInit | false | undefined,
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

function mountHub(server: ViteDevServer, hub: Engine['hub']): void {
  server.middlewares.use((req, res, next) => {
    if (isHubPath(req.url) && isLoopback(req.socket.remoteAddress)) hub.nodeMiddleware(req, res, next)
    else next()
  })
  server.httpServer?.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== `${hub.base}__ws`) return
    if (isLoopback(req.socket.remoteAddress)) hub.handleUpgrade(req, socket, head)
    else socket.destroy()
  })
}

async function bootEngine(
  server: ViteDevServer,
  options: ConcivConfig,
  agentPath: string,
  extensions: Awaited<ReturnType<typeof loadServerExtensions>>,
  nativePageDir: string | undefined,
): Promise<Engine> {
  const {start} = await import('@conciv/core/start')
  return start({
    options,
    root: server.config.root,
    port: options.port === undefined ? undefined : {preferred: options.port},
    bridge: makeViteBridge(server),
    launchEditor: makeOpenInEditor(server.config.root),
    allowedOrigins: devOrigins(server),
    extensions,
    nativePageDir,
    devEndpointDir: options.devEndpointDir,
    childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
  })
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
  '@conciv/ui-kit-chat > rrweb-snapshot',
  '@conciv/ui-kit-chat > shiki/core',
  '@conciv/ui-kit-chat > @chenglou/pretext',
  '@conciv/ui-kit-tap > @tiptap/suggestion',
  '@conciv/extension-page > @zumer/snapdom',
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

const RECORDER_LATE_DISCOVERED_DEPENDENCIES = ['rrweb', 'rrweb-player', '@rrweb/rrweb-plugin-console-record'].map(
  (dependency) => `@conciv/it > @conciv/extension-recorder > ${dependency}`,
)

function embedChunks(embedEntry: string): string[] {
  const dir = dirname(embedEntry)
  try {
    return readdirSync(dir)
      .filter((name) => /^mount-impl.*\.js$/.test(name))
      .map((name) => join(dir, name))
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
}

type DevToolsPlugin = Plugin & {devtools: {setup: (context: DevToolsContext) => void}}

type Surface = 'page' | 'dock'

function widgetSettings(widget: ConcivConfig['widget'], surface: Surface): ConcivSettingsInit | false | undefined {
  if (widget === false || surface === 'page') return widget
  return {...widget, launcher: false, defaultOpen: true, surface: 'dock'}
}

export function makeViteHook(options: ConcivConfig = {}, builtins: Builtins = NO_BUILTINS): DevToolsPlugin {
  let engine: Engine | null = null
  let apiBase: string | undefined
  let root = process.cwd()

  let deferToTsd = false
  let managedExcludes: string[] = []
  let docked = false
  let surface: Surface = 'page'
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
          renderer: {importFrom: EXTENSIONS_ROUTE, importName: 'default'},
        })
      },
    },
    config(userConfig) {
      const embedFiles =
        builtins.embedEntry === undefined ? [] : [builtins.embedEntry, ...embedChunks(builtins.embedEntry)]
      const base = concivSolidConfig({
        root: userConfig.root ?? process.cwd(),
        warmupFiles: [...embedFiles, ...builtins.clientEntries],
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
            ...RECORDER_LATE_DISCOVERED_DEPENDENCIES,
          ],
        },
      }
    },
    configEnvironment(_name, environmentConfig) {
      dropIncludedFromExcludes(environmentConfig.optimizeDeps, managedExcludes)
    },
    configResolved(config) {
      root = config.root
      docked =
        options.widget !== false &&
        resolveConfig(options, config.root).enabled &&
        config.plugins.some((plugin) => plugin.name === 'vite:devtools')
      surface = docked ? 'dock' : 'page'
      deferToTsd = config.plugins.some((p) => p.name === '@tanstack/devtools:inject-source')
    },
    resolveId(id) {
      return resolveExtensionsModule(id)
    },
    load(id) {
      return loadExtensionsModule(
        id,
        builtins.clientEntries,
        apiBase,
        builtins.embedEntry,
        builtins.dedupeEntry,
        surface,
      )
    },
    transform(code, id, opts) {
      if (options.enabled === false) return null
      return transformConcivModule(code, id, opts?.ssr ?? false, {root, deferToTsd})
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const cfg = resolveConfig(options, ctx.server?.config.root ?? process.cwd())
        if (!cfg.enabled || !engine) return []
        return htmlTags(engine.port, {widget: widgetSettings(options.widget, surface)})
      },
    },
    async configureServer(server: ViteDevServer) {
      const cfg = resolveConfig(options, server.config.root)
      if (!cfg.enabled) return
      const extensions = await loadServerExtensions(server.config.root, builtins.serverExtensions)
      engine = await bootEngine(
        server,
        options,
        installConcivBinShim(concivStateDir(cfg.stateRoot)),
        extensions,
        builtins.nativePageDir,
      )
      const booted = engine
      apiBase = `http://127.0.0.1:${booted.port}`
      mountWidget(server, apiBase, () => widgetSettings(options.widget, surface))
      mountHub(server, booted.hub)
      server.httpServer?.on('close', () => void booted.stop())
    },
  }
}
