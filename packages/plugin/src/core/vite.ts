import {join} from 'node:path'
import {createRequire} from 'node:module'
import type {Plugin, ViteDevServer} from 'vite'
import launchEditor from 'launch-editor'
import {defineBundlerBridge, type BundlerBridge} from '@aidx/protocol/bundler-types'
import {start, type Engine} from '@aidx/core/engine'
import {htmlTags} from '@aidx/core/widget-tags'
import {resolveConfig} from '@aidx/core/config'
import type {AidxConfig} from '@aidx/protocol/config-types'
import {installAidxBinShim} from './bin-shim.js'
import {viteConfig, viteResolve, viteGraph, viteTransform, viteUrls, type ViteLike} from './vite-tools.js'
import {DEFAULT_WIDGET_ROUTE, makeWidgetInject, makeWidgetServe} from './widget-middleware.js'
import {addSourceToJsx} from './inject-source.js'

const require = createRequire(import.meta.url)

function resolveWidgetFile(): string | null {
  try {
    return require.resolve('@aidx/widget/global')
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

function resolveWidgetSetup(options: AidxConfig): WidgetSetup {
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
  widgetConfig: AidxConfig['widget'],
): void {
  if (widget.url) {
    server.middlewares.stack.unshift({
      route: '',
      handle: makeWidgetInject(widget.url, previewId, apiBase, widgetConfig),
    })
  }
  if (widget.serveBundled && widget.file) server.middlewares.use(makeWidgetServe(widget.file))
}

function openInEditor(file: string, line: number): void {
  launchEditor(`${file}:${line}`)
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

function bootEngine(server: ViteDevServer, options: AidxConfig, agentPath: string): Promise<Engine> {
  return start({
    options,
    root: server.config.root,
    bridge: makeViteBridge(server),
    launchEditor: openInEditor,
    allowedOrigins: devOrigins(server),
    childEnv: (corePort) => ({...process.env, PATH: agentPath, AIDX_PORT: String(corePort)}),
  })
}

// The unplugin factory's rich `vite` hook: boots @aidx/core (with the live viteBridge +
// widget middleware), injects the widget head tags, and stamps JSX with data-aidx-source.
// serve-only (no-op in prod builds). enforce:'pre' so the source transform sees raw JSX/TSX
// before @vitejs/plugin-react compiles it away.
export function makeViteHook(options: AidxConfig = {}): Plugin {
  const widget = resolveWidgetSetup(options)
  let engine: Engine | null = null
  let root = process.cwd()
  return {
    name: 'aidx',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    transform(code, id) {
      if (options.enabled === false || id.includes('node_modules')) return null
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
      engine = await bootEngine(server, options, installAidxBinShim(join(cfg.stateRoot, '.aidx')))
      const booted = engine
      mountWidget(server, widget, cfg.previewId, `http://127.0.0.1:${booted.port}`, options.widget)
      server.httpServer?.on('close', () => void booted.stop())
    },
  }
}
