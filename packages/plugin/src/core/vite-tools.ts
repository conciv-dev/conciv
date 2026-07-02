import type {ViteDevServer} from 'vite'

export type ViteLike = ViteDevServer

export function viteConfig(server: ViteLike) {
  return {
    root: server.config.root,
    base: server.config.base,
    mode: server.config.mode,
    aliases: server.config.resolve.alias.map((a) => ({find: String(a.find), replacement: a.replacement})),
    plugins: server.config.plugins.map((p) => p.name),
  }
}

export async function viteResolve(server: ViteLike, spec: string, importer?: string) {
  const r = await server.pluginContainer.resolveId(spec, importer)
  return {id: r?.id ?? null}
}

export function viteGraph(server: ViteLike, file: string) {
  const mods = server.moduleGraph.getModulesByFile(file)
  if (!mods) return []
  return [...mods].map((m) => ({
    url: m.url,
    importers: [...m.importers].map((i) => i.url),
    importedModules: [...m.importedModules].map((i) => i.url),
  }))
}

export async function viteTransform(server: ViteLike, url: string) {
  const r = await server.transformRequest?.(url)
  return {code: r?.code ?? null}
}

export function viteUrls(server: ViteLike) {
  return server.resolvedUrls ?? {local: [], network: []}
}
