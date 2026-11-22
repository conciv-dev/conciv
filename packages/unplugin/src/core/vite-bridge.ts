import type {IncomingMessage, ServerResponse} from 'node:http'
import {join, resolve} from 'node:path'
import {ORPCError} from '@orpc/server'
import type {ErrorPayload, ModuleNode, ViteDevServer} from 'vite'
import type * as Bundler from '@conciv/plugin/schema/bundler'

export async function makeViteBridge(server: ViteDevServer): Promise<Bundler.BundlerBridge> {
  const {defineBundlerBridge} = await import('@conciv/plugin/schema/bundler')
  return defineBundlerBridge({
    id: 'vite',
    config: () => viteConfig(server),
    resolve: (spec, importer) => viteResolve(server, spec, importer),
    moduleGraph: (file) => viteGraph(server, file),
    transform: (url) => viteTransform(server, url),
    urls: () => viteUrls(server),
    restart: async (force) => {
      await server.restart?.(force)
    },
    subscribe: makeDiagnosticSubscribe(server),
  })
}

function viteConfig(server: ViteDevServer) {
  return {
    root: server.config.root,
    base: server.config.base,
    mode: server.config.mode,
    aliases: server.config.resolve.alias.map((a) => ({find: String(a.find), replacement: a.replacement})),
    plugins: server.config.plugins.map((p) => p.name),
  }
}

async function viteResolve(server: ViteDevServer, spec: string, importer?: string) {
  const r = await server.pluginContainer.resolveId(spec, importer)
  return {id: r?.id ?? null}
}

function findModules(server: ViteDevServer, file: string): ModuleNode[] {
  const root = server.config.root
  const nodes = [resolve(root, file), join(root, file)]
    .map((path) => [...(server.moduleGraph.getModulesByFile(path) ?? [])])
    .find((found) => found.length > 0)
  if (!nodes) throw new ORPCError('NOT_FOUND', {message: `no module for ${file} in the dev server's module graph`})
  return nodes
}

function viteGraph(server: ViteDevServer, file: string) {
  return findModules(server, file).map((m) => ({
    url: m.url,
    importers: [...m.importers].map((i) => i.url),
    importedModules: [...m.importedModules].map((i) => i.url),
  }))
}

async function viteTransform(server: ViteDevServer, url: string) {
  const r = await server.transformRequest?.(url)
  return {code: r?.code ?? null}
}

function viteUrls(server: ViteDevServer) {
  return server.resolvedUrls ?? {local: [], network: []}
}

function makeDiagnosticSubscribe(
  server: ViteDevServer,
): (listener: (diagnostic: Bundler.Diagnostic) => void) => () => void {
  const listeners = new Set<(diagnostic: Bundler.Diagnostic) => void>()
  const emit = (diagnostic: Bundler.Diagnostic): void => {
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

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'error' && 'err' in value
}
