// How the agent inspects + drives the live dev server (`aidx tools server …`). These ops
// are bundler-specific, so core consumes this interface and each bundler implements it in its
// own plugin package (e.g. viteBridge in @aidx/plugin) — core never imports a bundler.

export type BundlerConfig = {
  root: string
  base: string
  mode: string
  aliases: {find: string; replacement: string}[]
  plugins: string[]
}

export type ModuleNode = {url: string; importers: string[]; importedModules: string[]}

export type BundlerBridge = {
  id: string // 'vite' | 'webpack' | …
  config(): BundlerConfig
  resolve(spec: string, importer?: string): Promise<{id: string | null}>
  moduleGraph(file: string): ModuleNode[]
  transform(url: string): Promise<{code: string | null}>
  urls(): {local: string[]; network: string[]}
  reload(file: string): Promise<void>
  restart(force?: boolean): Promise<void>
}

export function defineBundlerBridge<T extends BundlerBridge>(bridge: T): T {
  if (!bridge.id) throw new Error('bundler bridge: id is required')
  return bridge
}
