// The /__pw/tools/* operations over the live ViteDevServer handle. Structural `ViteLike`
// type covers only the members we use (no `any`, no full vite type import needed). These
// power the `devgent tools` CLI the chat agent calls via Bash.

type Alias = {find: string | RegExp; replacement: string}
type ModuleLike = {url: string; importers: Set<{url: string}>; importedModules: Set<{url: string}>}

export type ViteLike = {
  config: {root: string; base: string; mode: string; resolve: {alias: Alias[]}; plugins: {name: string}[]}
  pluginContainer: {resolveId: (id: string, importer?: string) => Promise<{id: string} | null>}
  moduleGraph: {getModulesByFile: (file: string) => Set<ModuleLike> | undefined}
  transformRequest?: (url: string) => Promise<{code: string} | null>
  reloadModule?: (m: ModuleLike) => Promise<void>
  restart?: (force?: boolean) => Promise<void>
  resolvedUrls?: {local: string[]; network: string[]} | null
}

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
  return {id: r ? r.id : null}
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

export type LaunchFn = (file: string, line: number) => void

// Returns an opener that suppresses a repeat open of the same file:line within windowMs,
// so the agent can't spam editor tabs.
export function makeEditorOpener(launch: LaunchFn, windowMs: number, now: () => number) {
  const seen = new Map<string, number>()
  return (file: string, line = 1): void => {
    const key = `${file}:${line}`
    const last = seen.get(key) ?? -Infinity
    if (now() - last < windowMs) return
    seen.set(key, now())
    launch(file, line)
  }
}
