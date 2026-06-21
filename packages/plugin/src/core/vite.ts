import {join} from 'node:path'
import {createRequire} from 'node:module'
import type {Plugin, ViteDevServer} from 'vite'
import {defineBundlerBridge, type BundlerBridge} from '@mandarax/protocol/bundler-types'
import {start, type Engine} from '@mandarax/core/engine'
import {htmlTags} from '@mandarax/core/widget-tags'
import {resolveConfig} from '@mandarax/core/config'
import type {MandaraxConfig} from '@mandarax/protocol/config-types'
import {installMandaraxBinShim} from './bin-shim.js'
import {viteConfig, viteResolve, viteGraph, viteTransform, viteUrls, type ViteLike} from './vite-tools.js'
import {
  DEFAULT_WIDGET_ROUTE,
  EXTENSIONS_ROUTE,
  makeWidgetInject,
  makeWidgetServe,
  type Middleware,
} from './widget-middleware.js'
import {addSourceToJsx} from './inject-source.js'
import {makeOpenInEditor} from './open-editor.js'
import {isExtensionJsx, compileExtensionSolid} from './compile-extension.js'
import {EXTENSIONS_RESOLVED_ID, EXTENSIONS_VIRTUAL_ID, extensionsModuleSource} from './extensions.js'
import {bootServices, type BootedServices} from './services.js'

const require = createRequire(import.meta.url)

function resolveWidgetFile(): string | null {
  try {
    return require.resolve('@mandarax/widget/global')
  } catch {
    return null
  }
}

// The Vite BundlerBridge: wraps the live dev server's accessors (vite-tools.ts) into the
// bundler-agnostic interface core consumes. Vite-specific, so it lives in this package's vite hook.
function makeViteBridge(server: ViteLike): BundlerBridge {
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
  })
}

type WidgetSetup = {url: string | undefined; serveBundled: boolean; file: string | null}

function resolveWidgetSetup(options: MandaraxConfig): WidgetSetup {
  const file = resolveWidgetFile()
  return {
    url: options.widgetUrl ?? (file ? DEFAULT_WIDGET_ROUTE : undefined),
    serveBundled: !options.widgetUrl && file !== null,
    file,
  }
}

function mountWidget(
  server: ViteDevServer,
  widget: WidgetSetup,
  previewId: string,
  apiBase: string,
  widgetConfig: MandaraxConfig['widget'],
): void {
  if (widget.url) {
    server.middlewares.stack.unshift({
      route: '',
      handle: makeWidgetInject(widget.url, previewId, apiBase, widgetConfig),
    })
  }
  if (widget.serveBundled && widget.file) server.middlewares.use(makeWidgetServe(widget.file))
  server.middlewares.use(makeExtensionsServe(server))
}

// Serve the compiled extensions entry by running the virtual module through vite's own pipeline
// (resolveId/load above + import.meta.glob expansion + HMR wiring). Same dev origin as the page, so
// the injected <script type=module> works for both static and SSR document responses.
function makeExtensionsServe(server: ViteDevServer): Middleware {
  return (req, res, next) => {
    if ((req.url ?? '').split('?')[0] !== EXTENSIONS_ROUTE) {
      next()
      return
    }
    void server
      .transformRequest(EXTENSIONS_VIRTUAL_ID)
      .then((result) => {
        if (!result) {
          next()
          return
        }
        res.setHeader('content-type', 'text/javascript')
        res.end(result.code)
      })
      .catch(next)
  }
}

// The dev server's own origins (esp. a LAN IP like http://192.168.1.5:5173) — loopback origins
// are always allowed by the core CORS guard, so this only widens it to non-loopback dev hosts.
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

function bootEngine(
  server: ViteDevServer,
  options: MandaraxConfig,
  agentPath: string,
  services: BootedServices,
): Promise<Engine> {
  return start({
    options,
    root: server.config.root,
    bridge: makeViteBridge(server),
    launchEditor: makeOpenInEditor(server.config.root),
    allowedOrigins: devOrigins(server),
    extensions: services.extensions,
    dbProxyTarget: services.dbProxyTarget,
    syncHooks: services.syncHooks,
    childEnv: (corePort) => ({...process.env, PATH: agentPath, MANDARAX_PORT: String(corePort)}),
  })
}

// The unplugin factory's rich `vite` hook: boots @mandarax/core (with the live viteBridge +
// widget middleware), injects the widget head tags, and stamps JSX with data-mandarax-source.
// serve-only (no-op in prod builds). enforce:'pre' so the source transform sees raw JSX/TSX
// before @vitejs/plugin-react compiles it away.
export function makeViteHook(options: MandaraxConfig = {}): Plugin {
  const widget = resolveWidgetSetup(options)
  let engine: Engine | null = null
  let root = process.cwd()
  // When TanStack devtools' source injector is in the pipeline it stamps data-tsd-source (which
  // `locate` already reads), at its own position relative to the framework's per-environment
  // transforms. mandarax stamping too then yields divergent line numbers between the SSR and client
  // builds → a React hydration mismatch. Defer to it: detected from the resolved plugin list (same
  // for both builds), so the decision is deterministic, not order/code dependent.
  let deferToTsd = false
  return {
    name: 'mandarax',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
      deferToTsd = config.plugins.some((p) => p.name === '@tanstack/devtools:inject-source')
    },
    resolveId(id) {
      return id === EXTENSIONS_VIRTUAL_ID ? EXTENSIONS_RESOLVED_ID : null
    },
    load(id) {
      return id === EXTENSIONS_RESOLVED_ID ? extensionsModuleSource() : null
    },
    transform(code, id, opts) {
      if (options.enabled === false || id.includes('node_modules')) return null
      // Extension files are a Solid zone: compile their JSX with Solid before the host's React
      // transform runs (enforce:'pre'), so renderers/ui factories paint in the Solid widget.
      if (isExtensionJsx(id)) return compileExtensionSolid(code, id, opts?.ssr ?? false)
      if (deferToTsd) return null
      return addSourceToJsx(code, id, root)
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const cfg = resolveConfig(options, ctx.server?.config.root ?? process.cwd())
        if (!cfg.enabled || !engine) return []
        return htmlTags(engine.port, {previewId: cfg.previewId, widgetUrl: widget.url, widget: options.widget})
      },
    },
    async configureServer(server: ViteDevServer) {
      const cfg = resolveConfig(options, server.config.root)
      if (!cfg.enabled) return
      const services = await bootServices(server.config.root, cfg.stateRoot)
      engine = await bootEngine(server, options, installMandaraxBinShim(join(cfg.stateRoot, '.mandarax')), services)
      const booted = engine
      mountWidget(server, widget, cfg.previewId, `http://127.0.0.1:${booted.port}`, options.widget)
      server.httpServer?.on('close', () => void (booted.stop(), services.stop()))
    },
  }
}
