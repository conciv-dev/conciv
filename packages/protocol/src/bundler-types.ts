import {z} from 'zod'

export const BundlerConfigSchema = z.object({
  root: z.string(),
  base: z.string(),
  mode: z.string(),
  aliases: z.array(z.object({find: z.string(), replacement: z.string()})),
  plugins: z.array(z.string()),
})
export type BundlerConfig = z.infer<typeof BundlerConfigSchema>

export const ModuleNodeSchema = z.object({
  url: z.string(),
  importers: z.array(z.string()),
  importedModules: z.array(z.string()),
})
export type ModuleNode = z.infer<typeof ModuleNodeSchema>

export type BundlerBridge = {
  id: string
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
