import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

export type WorkspacePackage = {name: string; browser: boolean; e2e: boolean}

export type ShardPlan = {shard: string; chromium: boolean; packages: string[]}

export type E2eShardPlan = {shard: string; harnesses: boolean; packages: string[]}

export type ShardSizing = {
  targetMs: number
  overheadMs: number
  minShards: number
  maxShards: number
  bootstrapShards: number
}

export const PACKAGE_GROUPS = ['packages', 'packages/extensions', 'apps']

const E2E_GROUPS = ['e2e', 'apps']

export const PACKAGES_WITH_DEDICATED_JOBS = ['conciv-storybook']

export const E2E_HARNESS_PACKAGE = 'conciv-e2e-harnesses'

export const TARGET_SHARD_MS = 150_000
export const DEFAULT_PACKAGE_MS = 5_000

const PACKAGE_SHARD_SIZING: ShardSizing = {
  targetMs: TARGET_SHARD_MS,
  overheadMs: 0,
  minShards: 2,
  maxShards: 8,
  bootstrapShards: 4,
}

export const E2E_SHARD_SIZING: ShardSizing = {
  targetMs: 300_000,
  overheadMs: 30_000,
  minShards: 2,
  maxShards: 5,
  bootstrapShards: 3,
}

const BROWSER_DEPENDENCY_PREFIXES = ['playwright', '@playwright/', '@vitest/browser']

const VALID_PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function dependencyNames(manifest: Record<string, unknown>): string[] {
  return ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) => {
    const section = manifest[field]
    return isRecord(section) ? Object.keys(section) : []
  })
}

function usesBrowser(manifest: Record<string, unknown>): boolean {
  return dependencyNames(manifest).some((name) =>
    BROWSER_DEPENDENCY_PREFIXES.some((prefix) => name === prefix || name.startsWith(prefix)),
  )
}

function hasE2eScript(manifest: Record<string, unknown>): boolean {
  const scripts = manifest.scripts
  return isRecord(scripts) && typeof scripts['test:e2e'] === 'string'
}

function readPackage(dir: string): WorkspacePackage | null {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!isRecord(manifest) || typeof manifest.name !== 'string')
    throw new Error(`no usable package name in ${manifestPath}`)
  if (!VALID_PACKAGE_NAME.test(manifest.name))
    throw new Error(`invalid package name in ${manifestPath}: ${manifest.name}`)
  return {name: manifest.name, browser: usesBrowser(manifest), e2e: hasE2eScript(manifest)}
}

export function discoverPackages(rootDir: string, groupDirs: string[]): WorkspacePackage[] {
  const found = groupDirs.flatMap((group) => {
    const groupPath = join(rootDir, group)
    if (!existsSync(groupPath)) return []
    return readdirSync(groupPath, {withFileTypes: true})
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => readPackage(join(groupPath, entry.name)) ?? [])
  })
  return found.toSorted((a, b) => a.name.localeCompare(b.name))
}

export function plannedPackages(rootDir: string): WorkspacePackage[] {
  return discoverPackages(rootDir, PACKAGE_GROUPS).filter((entry) => !PACKAGES_WITH_DEDICATED_JOBS.includes(entry.name))
}

export function e2ePackages(rootDir: string): WorkspacePackage[] {
  return discoverPackages(rootDir, E2E_GROUPS).filter((entry) => entry.e2e)
}

export function planE2eShards(packages: WorkspacePackage[], timings: Record<string, number>): E2eShardPlan[] {
  return planShards(packages, timings, E2E_SHARD_SIZING).map((plan) => ({
    shard: plan.shard,
    harnesses: plan.packages.includes(E2E_HARNESS_PACKAGE),
    packages: plan.packages,
  }))
}

export function planShards(
  packages: WorkspacePackage[],
  timings: Record<string, number>,
  sizing: ShardSizing = PACKAGE_SHARD_SIZING,
): ShardPlan[] {
  if (packages.length === 0) return []
  const weighted = packages
    .map((entry) => ({...entry, weightMs: (timings[entry.name] ?? DEFAULT_PACKAGE_MS) + sizing.overheadMs}))
    .toSorted((a, b) => b.weightMs - a.weightMs || a.name.localeCompare(b.name))
  const totalMs = weighted.reduce((sum, entry) => sum + entry.weightMs, 0)
  const measuredCount = Math.max(Math.ceil(totalMs / sizing.targetMs), sizing.minShards, 1)
  const shardCount = Math.min(
    Object.keys(timings).length === 0 ? Math.max(measuredCount, sizing.bootstrapShards) : measuredCount,
    sizing.maxShards,
    packages.length,
  )
  const bins = Array.from({length: shardCount}, (_, index) => ({
    shard: `shard-${index + 1}`,
    loadMs: 0,
    members: [] as WorkspacePackage[],
  }))
  for (const entry of weighted) {
    const lightest = bins.reduce((best, bin) => (bin.loadMs < best.loadMs ? bin : best))
    lightest.loadMs += entry.weightMs
    lightest.members.push(entry)
  }
  return bins.map((bin) => ({
    shard: bin.shard,
    chromium: bin.members.some((member) => member.browser),
    packages: bin.members.map((member) => member.name).toSorted((a, b) => a.localeCompare(b)),
  }))
}

export function parseTimings(raw: string): Record<string, number> {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
    ),
  )
}

export function affectedPackages(candidates: WorkspacePackage[], affectedNames: string[] | null): WorkspacePackage[] {
  if (affectedNames === null) return candidates
  const affectedSet = new Set(affectedNames)
  return candidates.filter((candidate) => affectedSet.has(candidate.name))
}

const HARDCODED_GLOBAL_PATTERNS = [
  'pnpm-lock.yaml',
  'turbo.json',
  'package.json',
  'tsconfig*.json',
  '.github/workflows/**',
  'packages/vitest-config/**',
]

export function globalDependencyPatterns(rootDir: string): string[] {
  const manifestPath = join(rootDir, 'turbo.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const declared = isRecord(manifest) && Array.isArray(manifest.globalDependencies) ? manifest.globalDependencies : []
  const declaredPatterns = declared.filter((entry): entry is string => typeof entry === 'string')
  return [...new Set([...declaredPatterns, ...HARDCODED_GLOBAL_PATTERNS])]
}

function escapeRegExpLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function matchesGlobalPattern(file: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2))
  if (!pattern.includes('*')) return file === pattern
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExpLiteral).join('[^/]*')}$`)
  return regex.test(file)
}

export function matchedGlobalFile(changedFiles: string[], patterns: string[]): string | null {
  return changedFiles.find((file) => patterns.some((pattern) => matchesGlobalPattern(file, pattern))) ?? null
}
