import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {publishErrors} from './errors/errors.ts'

export type WorkspacePackage = {name: string; e2e: boolean}

export type ShardPlan = {shard: string; packages: string[]}

export type E2eShardPlan = {shard: string; harnesses: boolean; packages: string[]}

export type ShardSizing = {
  targetMs: number
  overheadMs: number
  minShards: number
  maxShards: number
  bootstrapShards: number
  splitHeavy: boolean
}

const PACKAGE_GROUPS = ['packages', 'packages/plugins', 'apps']

const E2E_GROUPS = ['e2e', 'apps']

const PACKAGES_WITH_DEDICATED_JOBS = ['conciv-storybook']

const E2E_HARNESS_PACKAGE = 'conciv-e2e-harnesses'

const TARGET_SHARD_MS = 150_000
const DEFAULT_PACKAGE_MS = 5_000

const PACKAGE_SHARD_SIZING: ShardSizing = {
  targetMs: TARGET_SHARD_MS,
  overheadMs: 0,
  minShards: 2,
  maxShards: 8,
  bootstrapShards: 4,
  splitHeavy: true,
}

export const E2E_SHARD_SIZING: ShardSizing = {
  targetMs: 300_000,
  overheadMs: 30_000,
  minShards: 2,
  maxShards: 5,
  bootstrapShards: 3,
  splitHeavy: false,
}

const VALID_PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
    throw publishErrors.NO_PACKAGE_NAME({path: manifestPath})
  if (!VALID_PACKAGE_NAME.test(manifest.name))
    throw publishErrors.INVALID_SHARD_PACKAGE_NAME({path: manifestPath, name: manifest.name})
  return {name: manifest.name, e2e: hasE2eScript(manifest)}
}

function discoverPackages(rootDir: string, groupDirs: string[]): WorkspacePackage[] {
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

const PART_SEPARATOR = '#'

export type PackagePart = {name: string; part: {index: number; count: number} | null}

export function readPackagePart(entry: string): PackagePart {
  const [name = entry, part] = entry.split(PART_SEPARATOR)
  const match = part === undefined ? null : /^(\d+)\/(\d+)$/.exec(part)
  if (match === null) return {name, part: null}
  return {name, part: {index: Number(match[1]), count: Number(match[2])}}
}

type WeightedEntry = WorkspacePackage & {weightMs: number}

function partCount(entry: WeightedEntry, sizing: ShardSizing, limit: number): number {
  if (!sizing.splitHeavy) return 1
  return Math.max(Math.min(Math.ceil(entry.weightMs / sizing.targetMs), limit), 1)
}

function splitHeavy(entry: WeightedEntry, count: number): WeightedEntry[] {
  if (count < 2) return [entry]
  return Array.from({length: count}, (_, index) => ({
    ...entry,
    name: `${entry.name}${PART_SEPARATOR}${index + 1}/${count}`,
    weightMs: entry.weightMs / count,
  }))
}

export function planShards(
  packages: WorkspacePackage[],
  timings: Record<string, number>,
  sizing: ShardSizing = PACKAGE_SHARD_SIZING,
): ShardPlan[] {
  if (packages.length === 0) return []
  const measured = packages.map((entry) => ({
    ...entry,
    weightMs: (timings[entry.name] ?? DEFAULT_PACKAGE_MS) + sizing.overheadMs,
  }))
  const totalMs = measured.reduce((sum, entry) => sum + entry.weightMs, 0)
  const measuredCount = Math.max(Math.ceil(totalMs / sizing.targetMs), sizing.minShards, 1)
  const entryCount = measured.reduce((sum, entry) => sum + partCount(entry, sizing, sizing.maxShards), 0)
  const shardCount = Math.min(
    Object.keys(timings).length === 0 ? Math.max(measuredCount, sizing.bootstrapShards) : measuredCount,
    sizing.maxShards,
    entryCount,
  )
  const weighted = measured
    .flatMap((entry) => splitHeavy(entry, partCount(entry, sizing, shardCount)))
    .toSorted((a, b) => b.weightMs - a.weightMs || a.name.localeCompare(b.name))
  const bins = Array.from({length: shardCount}, (_, index) => ({
    shard: `shard-${index + 1}`,
    loadMs: 0,
    members: [] as WorkspacePackage[],
  }))
  for (const entry of weighted) {
    const owner = readPackagePart(entry.name).name
    const free = bins.filter((bin) => !bin.members.some((member) => readPackagePart(member.name).name === owner))
    const lightest = free.reduce((best, bin) => (bin.loadMs < best.loadMs ? bin : best))
    lightest.loadMs += entry.weightMs
    lightest.members.push(entry)
  }
  return bins.map((bin) => ({
    shard: bin.shard,
    packages: bin.members.map((member) => member.name).toSorted((a, b) => a.localeCompare(b)),
  }))
}

export function parseTimings(raw: string): Record<string, number> {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return {}
  const measured = Object.entries(parsed).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
  )
  const byPackage = Object.groupBy(measured, ([name]) => readTimedPackage(name))
  return Object.fromEntries(
    Object.entries(byPackage).map(([name, entries = []]) => [
      name,
      entries.reduce((sum, [, timeMs]) => sum + timeMs, 0),
    ]),
  )
}

function readTimedPackage(timedName: string): string {
  return timedName.split(' ', 1)[0] ?? timedName
}
