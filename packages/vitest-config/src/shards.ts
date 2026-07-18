import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'

export type WorkspacePackage = {name: string; browser: boolean}

export type ShardPlan = {shard: string; chromium: boolean; packages: string[]}

export const TARGET_SHARD_MS = 150_000
export const DEFAULT_PACKAGE_MS = 5_000
const MIN_SHARDS = 2
const MAX_SHARDS = 8
const BOOTSTRAP_SHARDS = 4

const BROWSER_DEPENDENCY_PREFIXES = ['playwright', '@playwright/', '@vitest/browser']

const VALID_PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
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

function readPackage(dir: string): WorkspacePackage | null {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!isRecord(manifest) || typeof manifest.name !== 'string') return null
  if (!VALID_PACKAGE_NAME.test(manifest.name))
    throw new Error(`invalid package name in ${manifestPath}: ${manifest.name}`)
  return {name: manifest.name, browser: usesBrowser(manifest)}
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

export function planShards(packages: WorkspacePackage[], timings: Record<string, number>): ShardPlan[] {
  if (packages.length === 0) return []
  const weighted = packages
    .map((entry) => ({...entry, weightMs: timings[entry.name] ?? DEFAULT_PACKAGE_MS}))
    .toSorted((a, b) => b.weightMs - a.weightMs || a.name.localeCompare(b.name))
  const totalMs = weighted.reduce((sum, entry) => sum + entry.weightMs, 0)
  const measuredCount = Math.max(Math.ceil(totalMs / TARGET_SHARD_MS), MIN_SHARDS, 1)
  const shardCount = Math.min(
    Object.keys(timings).length === 0 ? Math.max(measuredCount, BOOTSTRAP_SHARDS) : measuredCount,
    MAX_SHARDS,
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
    Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  )
}
