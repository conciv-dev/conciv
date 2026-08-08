import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {
  affectedPackages,
  DEFAULT_PACKAGE_MS,
  discoverPackages,
  E2E_HARNESS_PACKAGE,
  E2E_SHARD_SIZING,
  e2ePackages,
  globalDependencyPatterns,
  matchedGlobalFile,
  matchesGlobalPattern,
  PACKAGE_GROUPS,
  PACKAGES_WITH_DEDICATED_JOBS,
  parseTimings,
  planE2eShards,
  planShards,
  plannedPackages,
  TARGET_SHARD_MS,
  type WorkspacePackage,
} from '../src/shards.ts'

function pkg(name: string, browser = false): WorkspacePackage {
  return {name, browser, e2e: false}
}

function e2ePkg(name: string): WorkspacePackage {
  return {name, browser: true, e2e: true}
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
    {name: '@x/board', browser: true, e2e: false},
    {name: '@x/core', browser: false, e2e: false},
    {name: '@x/embed', browser: true, e2e: false},
    {name: '@x/ui', browser: true, e2e: false},
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

test('every real workspace package lands in a shard unless it owns a dedicated CI job', () => {
  const repoRoot = join(import.meta.dirname, '..', '..', '..')
  const planned = new Set(plannedPackages(repoRoot).map((entry) => entry.name))
  const onDisk = PACKAGE_GROUPS.flatMap((group) =>
    readdirSync(join(repoRoot, group), {withFileTypes: true})
      .filter((entry) => entry.isDirectory() && existsSync(join(repoRoot, group, entry.name, 'package.json')))
      .map((entry) => JSON.parse(readFileSync(join(repoRoot, group, entry.name, 'package.json'), 'utf8')).name),
  )
  const unplanned = onDisk.filter(
    (name) => typeof name === 'string' && !planned.has(name) && !PACKAGES_WITH_DEDICATED_JOBS.includes(name),
  )
  expect(unplanned).toEqual([])
})

test('the workspace apps are sharded alongside the packages', () => {
  const planned = plannedPackages(join(import.meta.dirname, '..', '..', '..')).map((entry) => entry.name)
  expect(planned).toContain('@conciv/app')
  expect(planned).toContain('site')
})

test('a package with a dedicated CI job is kept out of the shard matrix', () => {
  const root = mkdtempSync(join(tmpdir(), 'shards-'))
  writeManifest(root, 'apps/storybook', {name: 'conciv-storybook', version: '1.0.0'})
  writeManifest(root, 'apps/conciv', {name: '@conciv/app', version: '1.0.0'})
  expect(plannedPackages(root).map((entry) => entry.name)).toEqual(['@conciv/app'])
})

test('e2ePackages keeps only workspace packages that actually define a test:e2e script', () => {
  const root = mkdtempSync(join(tmpdir(), 'shards-'))
  writeManifest(root, 'e2e/vite-react', {name: 'x-e2e-vite-react', scripts: {'test:e2e': 'playwright test'}})
  writeManifest(root, 'e2e/e2e-utils', {name: '@x/e2e-utils', scripts: {build: 'tsc'}})
  writeManifest(root, 'apps/site', {name: 'site', scripts: {'test:e2e': 'vitest run'}})
  writeManifest(root, 'apps/storybook', {name: 'x-storybook', scripts: {test: 'vitest run'}})
  expect(e2ePackages(root).map((entry) => entry.name)).toEqual(['site', 'x-e2e-vite-react'])
})

test('every real e2e consumer app plus the site lands in the e2e matrix, and e2e-utils does not', () => {
  const names = e2ePackages(join(import.meta.dirname, '..', '..', '..')).map((entry) => entry.name)
  expect(names).toContain('conciv-e2e-vite-react')
  expect(names).toContain('conciv-e2e-init')
  expect(names).toContain(E2E_HARNESS_PACKAGE)
  expect(names).toContain('site')
  expect(names).not.toContain('@conciv/e2e-utils')
  expect(names).not.toContain('conciv-storybook')
})

test('planE2eShards flags only the shard that owns the harness matrix', () => {
  const packages = [e2ePkg(E2E_HARNESS_PACKAGE), e2ePkg('app-a'), e2ePkg('app-b')]
  const shards = planE2eShards(packages, {[E2E_HARNESS_PACKAGE]: 400_000, 'app-a': 200_000, 'app-b': 200_000})
  expect(shards.filter((shard) => shard.harnesses).flatMap((shard) => shard.packages)).toEqual([E2E_HARNESS_PACKAGE])
  expect(shards.flatMap((shard) => shard.packages).toSorted()).toEqual(['app-a', 'app-b', E2E_HARNESS_PACKAGE])
})

test('planE2eShards packs bigger bins than the package matrix so per-shard setup is not repaid too often', () => {
  const packages = Array.from({length: 12}, (_, index) => e2ePkg(`app${index}`))
  const timings = Object.fromEntries(packages.map((entry) => [entry.name, TARGET_SHARD_MS]))
  expect(planE2eShards(packages, timings).length).toBeLessThan(planShards(packages, timings).length)
  expect(planE2eShards(packages, timings)).toHaveLength(E2E_SHARD_SIZING.maxShards)
})

test('planE2eShards charges every app a fixed server-boot overhead the case timings never capture', () => {
  const packages = Array.from({length: 10}, (_, index) => e2ePkg(`app${index}`))
  const timings = Object.fromEntries(packages.map((entry) => [entry.name, 40_000]))
  expect(planE2eShards(packages, timings)).toHaveLength(3)
  expect(planShards(packages, timings, {...E2E_SHARD_SIZING, overheadMs: 0})).toHaveLength(2)
})

test('planE2eShards spreads across three shards on the bootstrap run with no baseline', () => {
  const packages = Array.from({length: 15}, (_, index) => e2ePkg(`app${index}`))
  expect(planE2eShards(packages, {})).toHaveLength(E2E_SHARD_SIZING.bootstrapShards)
})

test('a package.json without a usable name fails the plan instead of vanishing from it', () => {
  const root = mkdtempSync(join(tmpdir(), 'shards-'))
  writeManifest(root, 'packages/nameless', {version: '1.0.0'})
  expect(() => discoverPackages(root, ['packages'])).toThrow(/nameless/)
})

test('affectedPackages keeps only the named candidates, unchanged order and weighting', () => {
  const candidates = [pkg('a'), pkg('b', true), pkg('c')]
  expect(affectedPackages(candidates, ['a', 'c'])).toEqual([pkg('a'), pkg('c')])
})

test('affectedPackages with a null affected list returns every candidate unfiltered', () => {
  const candidates = [pkg('a'), pkg('b'), pkg('c')]
  expect(affectedPackages(candidates, null)).toBe(candidates)
})

test('affectedPackages ignores affected names with no matching candidate instead of crashing', () => {
  const candidates = [pkg('a'), pkg('b')]
  expect(affectedPackages(candidates, ['a', 'no-such-package'])).toEqual([pkg('a')])
})

test('affectedPackages with an empty affected list returns an empty result', () => {
  const candidates = [pkg('a'), pkg('b')]
  expect(affectedPackages(candidates, [])).toEqual([])
})

test('affectedPackages feeding planShards balances identically to planning the filtered set standalone', () => {
  const candidates = [pkg('a'), pkg('b', true), pkg('c'), pkg('d'), pkg('e')]
  const timings = {a: 100_000, b: 90_000, c: 80_000, d: 20_000, e: 10_000}
  const filtered = affectedPackages(candidates, ['a', 'c', 'e'])
  const standalone = candidates.filter((entry) => ['a', 'c', 'e'].includes(entry.name))
  expect(planShards(filtered, timings)).toEqual(planShards(standalone, timings))
})

test('matchesGlobalPattern matches an exact root file but not a same-named nested one', () => {
  expect(matchesGlobalPattern('package.json', 'package.json')).toBe(true)
  expect(matchesGlobalPattern('packages/core/package.json', 'package.json')).toBe(false)
})

test('matchesGlobalPattern matches a directory glob by prefix', () => {
  expect(matchesGlobalPattern('.github/workflows/ci.yml', '.github/workflows/**')).toBe(true)
  expect(matchesGlobalPattern('.github/dependabot.yml', '.github/workflows/**')).toBe(false)
})

test('matchesGlobalPattern matches a root-level wildcard but not a nested tsconfig', () => {
  expect(matchesGlobalPattern('tsconfig.base.json', 'tsconfig*.json')).toBe(true)
  expect(matchesGlobalPattern('packages/core/tsconfig.json', 'tsconfig*.json')).toBe(false)
})

test('matchedGlobalFile returns the first changed file that hits any global pattern', () => {
  const changed = ['packages/core/src/index.ts', 'pnpm-lock.yaml', 'README.md']
  expect(matchedGlobalFile(changed, ['pnpm-lock.yaml', 'turbo.json'])).toBe('pnpm-lock.yaml')
  expect(matchedGlobalFile(['packages/core/src/index.ts'], ['pnpm-lock.yaml'])).toBeNull()
})

test('globalDependencyPatterns folds turbo.json globalDependencies into the hardcoded escape hatch', () => {
  const root = mkdtempSync(join(tmpdir(), 'shards-'))
  writeFileSync(
    join(root, 'turbo.json'),
    JSON.stringify({globalDependencies: ['pnpm-workspace.yaml', '.oxlintrc.json']}),
  )
  const patterns = globalDependencyPatterns(root)
  expect(patterns).toContain('pnpm-workspace.yaml')
  expect(patterns).toContain('.oxlintrc.json')
  expect(patterns).toContain('packages/vitest-config/**')
  expect(patterns).toContain('pnpm-lock.yaml')
})
