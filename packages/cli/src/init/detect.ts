import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {detectPackageManager} from 'nypm'
import {z} from 'zod'

export type Framework = 'nextjs' | 'vite' | 'webpack' | 'rspack' | 'rollup' | 'esbuild' | 'unknown'
// oxlint-disable-next-line conciv/banned-vocabulary -- packageManager is the npm manifest field name, mandated by the init plan's Task 4 contract
export type Detected = {framework: Framework; configFile: string | null; packageManager: string}

type FrameworkRule = {framework: Framework; packages: string[]; configFiles: string[]}

const frameworkRules: FrameworkRule[] = [
  {framework: 'nextjs', packages: ['next'], configFiles: ['next.config.ts', 'next.config.js', 'next.config.mjs']},
  {
    framework: 'vite',
    packages: ['vite'],
    configFiles: ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'],
  },
  {
    framework: 'rspack',
    packages: ['@rspack/core', '@rspack/cli'],
    configFiles: ['rspack.config.js', 'rspack.config.ts'],
  },
  {framework: 'webpack', packages: ['webpack'], configFiles: ['webpack.config.js', 'webpack.config.ts']},
  {framework: 'rollup', packages: ['rollup'], configFiles: ['rollup.config.js', 'rollup.config.mjs']},
  {framework: 'esbuild', packages: ['esbuild'], configFiles: []},
]

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

export function detectFramework(cwd: string): {framework: Framework; configFile: string | null} {
  const declared = declaredDependencies(cwd)
  const rule = frameworkRules.find((candidate) => candidate.packages.some((name) => declared.has(name)))
  if (!rule) return {framework: 'unknown', configFile: null}
  const configFile = rule.configFiles.find((name) => existsSync(join(cwd, name))) ?? null
  return {framework: rule.framework, configFile}
}

export async function detectProject(cwd: string): Promise<Detected> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  return {...detectFramework(cwd), packageManager: found?.name ?? 'npm'}
}

function declaredDependencies(cwd: string): Set<string> {
  const manifestPath = join(cwd, 'package.json')
  if (!existsSync(manifestPath)) return new Set()
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  if (!parsed.success) return new Set()
  return new Set([...Object.keys(parsed.data.dependencies ?? {}), ...Object.keys(parsed.data.devDependencies ?? {})])
}
