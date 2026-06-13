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

// The devgent dev agent as a vite plugin. Boots @devgent/core (its own port) and injects the
// widget head tags. Only applies in `serve` (dev); a no-op for production builds.
export function devgent(options: DevgentConfig = {}): Plugin {
  const widgetFile = resolveWidgetFile()
  const effectiveWidgetUrl = options.widgetUrl ?? (widgetFile ? DEFAULT_WIDGET_ROUTE : undefined)
  const serveBundledWidget = !options.widgetUrl && widgetFile !== null
  // configureServer boots the engine and learns its port; transformIndexHtml injects that port
  // into the page. Two vite hooks, one value — shared over this closure.
  let engine: Engine | null = null
  return {
    name: 'devgent',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const cfg = resolveConfig(options, ctx.server?.config.root ?? process.cwd())
        if (!cfg.enabled || !engine) return []
        return htmlTags(engine.port, {previewId: cfg.previewId, widgetUrl: effectiveWidgetUrl})
      },
    },
    async configureServer(server: ViteDevServer) {
      const root = server.config.root
      const cfg = resolveConfig(options, root)
      if (!cfg.enabled) return

      if (effectiveWidgetUrl) {
        server.middlewares.stack.unshift({route: '', handle: makeWidgetInject(effectiveWidgetUrl, cfg.previewId)})
      }
      if (serveBundledWidget && widgetFile) server.middlewares.use(makeWidgetServe(widgetFile))

      // CLI shim on the spawned agent's PATH so `devgent tools` resolves to @devgent/cli.
      const binDir = join(cfg.lockDir, '.devgent', 'bin')
      mkdirSync(binDir, {recursive: true})
      const shim = join(binDir, 'devgent')
      try {
        const binPath = require.resolve('@devgent/cli/bin')
        rmSync(shim, {force: true})
        symlinkSync(binPath, shim)
      } catch {
        // best effort — fall back to whatever `devgent` is on PATH.
      }
      const agentPath = `${binDir}${delimiter}${process.env.PATH ?? ''}`

      engine = await start({
        options,
        root,
        bridge: makeViteBridge(server),
        launchEditor: (file, line) => launchEditor(`${file}:${line}`),
        childEnv: (corePort) => ({...process.env, PATH: agentPath, DEVGENT_PORT: String(corePort)}),
      })
      const booted = engine
      server.httpServer?.on('close', () => void booted.stop())
    },
  }
}
