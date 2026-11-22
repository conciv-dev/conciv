import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {detectPackageManager, type PackageManagerName} from 'nypm'
import {hasDependency, readManifest} from './steps/manifest.js'

export type Framework = 'nextjs' | 'astro' | 'vite' | 'webpack' | 'rspack' | 'rollup' | 'esbuild' | 'unknown'
export type Detected = {framework: Framework; configFile: string | null; packageManager: string}

type FrameworkRule = {framework: Framework; packages: string[]; configFiles: string[]}

const frameworkRules: FrameworkRule[] = [
  {framework: 'nextjs', packages: ['next'], configFiles: ['next.config.ts', 'next.config.js', 'next.config.mjs']},
  {
    framework: 'astro',
    packages: ['astro'],
    configFiles: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'],
  },
  {
    framework: 'vite',
    packages: ['vite'],
    configFiles: ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'],
  },
  {
    framework: 'rspack',
    packages: ['@rspack/core', '@rspack/cli'],
    configFiles: ['rspack.config.js', 'rspack.config.ts', 'rspack.config.cjs', 'rspack.config.mjs'],
  },
  {
    framework: 'webpack',
    packages: ['webpack'],
    configFiles: ['webpack.config.js', 'webpack.config.ts', 'webpack.config.cjs', 'webpack.config.mjs'],
  },
  {framework: 'rollup', packages: ['rollup'], configFiles: ['rollup.config.js', 'rollup.config.mjs']},
  {framework: 'esbuild', packages: ['esbuild'], configFiles: []},
]

export function detectFramework(cwd: string): {framework: Framework; configFile: string | null} {
  const declared = existsSync(join(cwd, 'package.json')) ? readManifest(cwd) : {}
  const rule = frameworkRules.find((candidate) => candidate.packages.some((name) => hasDependency(declared, name)))
  if (!rule) return {framework: 'unknown', configFile: null}
  const configFile = rule.configFiles.find((name) => existsSync(join(cwd, name))) ?? null
  return {framework: rule.framework, configFile}
}

export async function detectPackageManagerName(cwd: string): Promise<PackageManagerName> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  return found?.name ?? 'npm'
}

export async function detectProject(cwd: string): Promise<Detected> {
  return {...detectFramework(cwd), packageManager: await detectPackageManagerName(cwd)}
}
