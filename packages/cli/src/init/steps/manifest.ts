import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

export type PackageJson = z.infer<typeof manifestSchema>

export function readManifest(cwd: string): PackageJson {
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')))
  if (!parsed.success) return {}
  return parsed.data
}

export function hasDependency(pkg: PackageJson, name: string): boolean {
  return name in (pkg.dependencies ?? {}) || name in (pkg.devDependencies ?? {})
}
