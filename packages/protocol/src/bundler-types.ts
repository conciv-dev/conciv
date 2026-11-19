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
