import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {
  DEFAULT_PACKAGE_MS,
  discoverPackages,
  mergeTimings,
  parseTimings,
  planShards,
  TARGET_SHARD_MS,
  type WorkspacePackage,
} from '../src/shards.ts'

function pkg(name: string, browser = false): WorkspacePackage {
  return {name, browser}
}

function writeManifest(root: string, dir: string, manifest: Record<string, unknown>): void {
  mkdirSync(join(root, dir), {recursive: true})
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest))
}

test('discoverPackages finds workspace packages and flags browser dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'shards-'))
  writeManifest(root, 'packages/embed', {name: '@x/embed', devDependencies: {playwright: '^1'}})
  writeManifest(root, 'packages/core', {name: '@x/core', devDependencies: {vitest: '^4'}})
  writeManifest(root, 'packages/ui', {name: '@x/ui', devDependencies: {'@vitest/browser-playwright': '^4'}})
  writeManifest(root, 'packages/extensions/board', {name: '@x/board', devDependencies: {playwright: '^1'}})
  mkdirSync(join(root, 'packages', 'no-manifest'))
  expect(discoverPackages(root, ['packages', 'packages/extensions'])).toEqual([
    {name: '@x/board', browser: true},
    {name: '@x/core', browser: false},
    {name: '@x/embed', browser: true},
    {name: '@x/ui', browser: true},
  ])
})

test('discoverPackages rejects package names that could smuggle turbo arguments', () => {
  const root = mkdtempSync(join(tmpdir(), 'shards-'))
  writeManifest(root, 'packages/evil', {name: '--filter=... --continue'})
  expect(() => discoverPackages(root, ['packages'])).toThrow(/invalid package name/)
})

test('planShards partitions every package exactly once', () => {
  const packages = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => pkg(name))
  const shards = planShards(packages, {a: 100_000, b: 90_000, c: 80_000, d: 20_000, e: 10_000, f: 5_000})
  const assigned = shards.flatMap((shard) => shard.packages).toSorted()
  expect(assigned).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
})

test('planShards isolates a dominant package and balances the rest', () => {
  const packages = [pkg('whale', true), pkg('mid1'), pkg('mid2'), pkg('small1'), pkg('small2')]
  const shards = planShards(packages, {whale: 300_000, mid1: 50_000, mid2: 45_000, small1: 5_000, small2: 5_000})
  const whaleShard = shards.find((shard) => shard.packages.includes('whale'))
  expect(whaleShard?.packages).toEqual(['whale'])
  expect(whaleShard?.chromium).toBe(true)
})

test('planShards derives chromium per shard from member dependencies', () => {
  const shards = planShards([pkg('browser-heavy', true), pkg('node-only')], {
    'browser-heavy': 200_000,
    'node-only': 200_000,
  })
  const byName = new Map(shards.map((shard) => [shard.packages.join(','), shard.chromium]))
  expect(byName.get('browser-heavy')).toBe(true)
  expect(byName.get('node-only')).toBe(false)
})

test('planShards scales shard count with total measured time', () => {
  const packages = Array.from({length: 10}, (_, index) => pkg(`p${index}`))
  const timings = Object.fromEntries(packages.map((entry) => [entry.name, TARGET_SHARD_MS]))
  expect(planShards(packages, timings)).toHaveLength(8)
})

test('planShards spreads wide without any baseline so the bootstrap run still parallelizes', () => {
  const packages = Array.from({length: 10}, (_, index) => pkg(`p${index}`))
  expect(planShards(packages, {})).toHaveLength(4)
  expect(planShards(packages, {p0: 1_000})).toHaveLength(2)
})

test('planShards falls back to the default weight for unmeasured packages', () => {
  const shards = planShards([pkg('known'), pkg('unknown')], {known: DEFAULT_PACKAGE_MS})
  expect(shards.flatMap((shard) => shard.packages).toSorted()).toEqual(['known', 'unknown'])
})

test('planShards is deterministic', () => {
  const packages = ['z', 'y', 'x', 'w'].map((name) => pkg(name))
  const timings = {z: 10_000, y: 10_000, x: 10_000, w: 10_000}
  expect(planShards(packages, timings)).toEqual(planShards(packages.toReversed(), timings))
})

test('parseTimings keeps numeric entries and drops everything else', () => {
  expect(parseTimings('{"a": 5, "b": "junk", "c": null}')).toEqual({a: 5})
  expect(parseTimings('[]')).toEqual({})
})

test('mergeTimings lets later sources win and sorts by name', () => {
  expect(mergeTimings([{b: 1, a: 2}, {b: 3}])).toEqual({a: 2, b: 3})
})
