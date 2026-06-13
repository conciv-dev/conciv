import {mkdirSync, rmSync, symlinkSync} from 'node:fs'
import {join, delimiter} from 'node:path'
import {createRequire} from 'node:module'
import type {Plugin, ViteDevServer} from 'vite'
import launchEditor from 'launch-editor'
import {defineBundlerBridge, type BundlerBridge} from '@devgent/protocol/bundler-types'
import {start, htmlTags, type Engine} from '@devgent/core/engine'
import {resolveConfig, type DevgentConfig} from '@devgent/core/config'
import {viteConfig, viteResolve, viteGraph, viteTransform, viteUrls, type ViteLike} from './tools-layer.js'
import {DEFAULT_WIDGET_ROUTE, makeWidgetInject, makeWidgetServe} from './widget-middleware.js'

const require = createRequire(import.meta.url)

function resolveWidgetFile(): string | null {
  try {
    return require.resolve('@devgent/widget/global')
  } catch {
    return null
  }
}

// The Vite BundlerBridge: wraps the live dev server's accessors (tools-layer.ts) into the
// bundler-agnostic interface core consumes. Plan 4 lifts this into @devgent/plugin-vite.
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

function resolveWidgetSetup(options: DevgentConfig): WidgetSetup {
  const file = resolveWidgetFile()
  return {
    url: options.widgetUrl ?? (file ? DEFAULT_WIDGET_ROUTE : undefined),
    serveBundled: !options.widgetUrl && file !== null,
    file,
  }
}

function mountWidget(server: ViteDevServer, widget: WidgetSetup, previewId: string): void {
  if (widget.url) server.middlewares.stack.unshift({route: '', handle: makeWidgetInject(widget.url, previewId)})
  if (widget.serveBundled && widget.file) server.middlewares.use(makeWidgetServe(widget.file))
}

// Drop a `devgent` shim on the spawned agent's PATH → @devgent/cli, so its `devgent tools` Bash
// calls resolve. Returns the augmented PATH; best-effort (falls back to PATH's `devgent`).
function installCliShim(lockDir: string): string {
  const binDir = join(lockDir, '.devgent', 'bin')
  mkdirSync(binDir, {recursive: true})
  try {
    const shim = join(binDir, 'devgent')
    rmSync(shim, {force: true})
    symlinkSync(require.resolve('@devgent/cli/bin'), shim)
  } catch {
    // best effort
  }
  return `${binDir}${delimiter}${process.env.PATH ?? ''}`
}

function openInEditor(file: string, line: number): void {
  launchEditor(`${file}:${line}`)
}

function bootEngine(server: ViteDevServer, options: DevgentConfig, agentPath: string): Promise<Engine> {
  return start({
    options,
    root: server.config.root,
    bridge: makeViteBridge(server),
    launchEditor: openInEditor,
    childEnv: (corePort) => ({...process.env, PATH: agentPath, DEVGENT_PORT: String(corePort)}),
  })
}

// The devgent dev agent as a vite plugin. Boots @devgent/core (its own port) and injects the
// widget head tags. Only applies in `serve` (dev); a no-op for production builds. The two hooks
// share `options` (the plugin's input) and `engine` (booted in configureServer, read in
// transformIndexHtml) — the only state a vite plugin intrinsically carries.
export function devgent(options: DevgentConfig = {}): Plugin {
  const widget = resolveWidgetSetup(options)
  let engine: Engine | null = null
  return {
    name: 'devgent',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const cfg = resolveConfig(options, ctx.server?.config.root ?? process.cwd())
        if (!cfg.enabled || !engine) return []
        return htmlTags(engine.port, {previewId: cfg.previewId, widgetUrl: widget.url})
      },
    },
    async configureServer(server: ViteDevServer) {
      const cfg = resolveConfig(options, server.config.root)
      if (!cfg.enabled) return
      mountWidget(server, widget, cfg.previewId)
      engine = await bootEngine(server, options, installCliShim(cfg.lockDir))
      const booted = engine
      server.httpServer?.on('close', () => void booted.stop())
    },
  }
}
