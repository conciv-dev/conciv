import {dirname, join} from 'node:path'
import {readdirSync} from 'node:fs'
import type {Plugin, ViteDevServer} from 'vite'
import {defineBundlerBridge, type BundlerBridge} from '@conciv/protocol/bundler-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {Engine} from '@conciv/core/start'
import {resolveConfig} from '@conciv/core/config'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {installConcivBinShim} from './bin-shim.js'
import {viteConfig, viteResolve, viteGraph, viteTransform, viteUrls, type ViteLike} from './vite-tools.js'
import {htmlTags, makeWidgetInject} from './widget-middleware.js'
import {makeOpenInEditor} from './open-editor.js'
import type {AnyExtension} from '@conciv/extension'
import {type Builtins, NO_BUILTINS, loadServerExtensions} from '@conciv/extension-compiler/extensions'
import {
  loadExtensionsModule,
  concivSolidConfig,
  concivSrcEntry,
  dropIncludedFromExcludes,
  resolveExtensionsModule,
  transformConcivModule,
} from '@conciv/extension-compiler/vite-plumbing'

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

function mountWidget(server: ViteDevServer, apiBase: string, widgetConfig: ConcivConfig['widget']): void {
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

async function bootEngine(
  server: ViteDevServer,
  options: ConcivConfig,
  agentPath: string,
  extensions: AnyExtension[],
): Promise<Engine> {
  const {start} = await import('@conciv/core/start')
  return start({
    options,
    root: server.config.root,
    bridge: makeViteBridge(server),
    launchEditor: makeOpenInEditor(server.config.root),
    allowedOrigins: devOrigins(server),
    extensions,
    childEnv: (corePort) => ({...process.env, PATH: agentPath, CONCIV_PORT: String(corePort)}),
  })
}

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

export function makeViteHook(options: ConcivConfig = {}, builtins: Builtins = NO_BUILTINS): Plugin {
  let engine: Engine | null = null
  let apiBase: string | undefined
  let root = process.cwd()

  let deferToTsd = false
  let managedExcludes: string[] = []
  return {
    name: 'conciv',
    apply: 'serve',
    enforce: 'pre',
    config(userConfig) {
      const embedFiles =
        builtins.embedEntry === undefined ? [] : [builtins.embedEntry, ...embedChunks(builtins.embedEntry)]
      const base = concivSolidConfig({
        root: userConfig.root ?? process.cwd(),
        warmupFiles: [...embedFiles, ...builtins.clientEntries],
      })
      base.optimizeDeps.exclude.push('@conciv/embed')
      managedExcludes = [...base.optimizeDeps.exclude]
      return base
    },
    configEnvironment(_name, environmentConfig) {
      dropIncludedFromExcludes(environmentConfig.optimizeDeps, managedExcludes)
    },
    configResolved(config) {
      root = config.root
      deferToTsd = config.plugins.some((p) => p.name === '@tanstack/devtools:inject-source')
    },
    async resolveId(id, importer) {
      const virtual = resolveExtensionsModule(id)
      if (virtual) return virtual
      if (process.env.CONCIV_E2E) return null
      if (!id.startsWith('@conciv/')) return null
      if (id === '@conciv/extension' || id.startsWith('@conciv/extension/')) return null
      const resolved = await this.resolve(id, importer, {skipSelf: true})
      if (!resolved) return null
      return concivSrcEntry(resolved.id)
    },
    load(id) {
      return loadExtensionsModule(id, builtins.clientEntries, apiBase, builtins.embedEntry)
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
        return htmlTags(engine.port, {widget: options.widget})
      },
    },
    async configureServer(server: ViteDevServer) {
      const cfg = resolveConfig(options, server.config.root)
      if (!cfg.enabled) return
      const extensions = await loadServerExtensions(server.config.root, builtins.serverExtensions)
      engine = await bootEngine(server, options, installConcivBinShim(concivStateDir(cfg.stateRoot)), extensions)
      const booted = engine
      apiBase = `http://127.0.0.1:${booted.port}`
      mountWidget(server, apiBase, options.widget)
      server.httpServer?.on('close', () => void booted.stop())
    },
  }
}
