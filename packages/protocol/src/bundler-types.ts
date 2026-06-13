// Bundler bridge contract. The agent can inspect + drive the live dev server via
// `devgent tools server …` (config / resolve / module-graph / transform / urls / reload /
// restart). Those operations are bundler-specific (Vite's module graph + HMR are nothing like
// webpack's), so @devgent/core never imports a bundler — it consumes this interface, and each
// bundler implements it in its own plugin package (e.g. viteBridge in @devgent/plugin-vite).

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

// Generic typed factory: every bundler bridge is authored through this helper (never a bare
// object literal), mirroring defineHarness/defineRunner. <T extends BundlerBridge> preserves
// the implementation's exact literal type.
export function defineBundlerBridge<T extends BundlerBridge>(bridge: T): T {
  if (!bridge.id) throw new Error('bundler bridge: id is required')
  return bridge
}
