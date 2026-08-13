import {z} from 'zod'

const manifestSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  private: z.boolean().optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
})

export type Manifest = z.infer<typeof manifestSchema>

export function parseManifest(raw: unknown, manifestPath: string): Manifest {
  const result = manifestSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`${manifestPath}: invalid package manifest - ${result.error.message}`)
  }
  return result.data
}
