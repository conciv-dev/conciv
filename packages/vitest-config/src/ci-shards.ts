#!/usr/bin/env node
import {execFileSync} from 'node:child_process'
import {appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  affectedPackages,
  e2ePackages,
  type E2eShardPlan,
  globalDependencyPatterns,
  isRecord,
  matchedGlobalFile,
  parseTimings,
  planE2eShards,
  planShards,
  plannedPackages,
  type ShardPlan,
  type WorkspacePackage,
} from './shards.ts'
import {
  loadSummaries,
  mergeSummaries,
  type PackageSummary,
  parseSummaries,
  type RenderOptions,
  renderSummary,
} from './summary.ts'

const VALUE_FLAGS = ['--timings', '--task', '--output']

type TaskConfig = {
  turboTasks: string[]
  reportRoots: string[]
  render: Partial<RenderOptions>
  candidates: (rootDir: string) => WorkspacePackage[]
  pack: (packages: WorkspacePackage[], timings: Record<string, number>) => (ShardPlan | E2eShardPlan)[]
}

const TASKS: Record<string, TaskConfig> = {
  test: {
    turboTasks: ['typecheck', 'lint', 'test', '--continue=dependencies-successful'],
    reportRoots: ['packages', 'apps'],
    render: {},
    candidates: (rootDir) => plannedPackages(rootDir),
    pack: (packages, timings) => planShards(packages, timings),
  },
  e2e: {
    turboTasks: ['test:e2e', '--continue', '--concurrency=1'],
    reportRoots: ['e2e', 'apps/site'],
    render: {title: 'E2e consumer apps', details: true},
    candidates: (rootDir) => e2ePackages(rootDir),
    pack: (packages, timings) => planE2eShards(packages, timings),
  },
}

function argValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag)
  if (index === -1 || index + 1 >= args.length) return null
  return args[index + 1] ?? null
}

function taskConfig(args: string[]): TaskConfig {
  const requested = argValue(args, '--task') ?? 'test'
  const config = TASKS[requested]
  if (config === undefined) throw new Error(`unknown --task ${requested}; expected ${Object.keys(TASKS).join(' or ')}`)
  return config
}

function positionals(args: string[]): string[] {
  return args.filter((arg, index) => !arg.startsWith('--') && !VALUE_FLAGS.includes(args[index - 1] ?? ''))
}

const MAX_TIMINGS_BYTES = 1_000_000

function readBoundedTimings(path: string | null): Record<string, number> {
  if (path === null || !existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  if (raw.length > MAX_TIMINGS_BYTES) return {}
  return parseTimings(raw)
}

export type AffectedComputation = {
  affected: string[] | null
  baseSha: string | null
  rail: string
}

function gitOutput(rootDir: string, args: string[]): string {
  return execFileSync('git', args, {cwd: rootDir, encoding: 'utf8'}).trim()
}

function pinnedTurboVersion(rootDir: string): string {
  const manifestPath = join(rootDir, 'package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const devDependencies = isRecord(manifest) ? manifest.devDependencies : undefined
  const pinned = isRecord(devDependencies) ? devDependencies.turbo : undefined
  if (typeof pinned !== 'string') throw new Error('no turbo devDependency pinned in root package.json')
  return pinned.replace(/^[\^~]/, '')
}

function turboAffectedPackageNames(rootDir: string, baseSha: string, pnpmBin: string): string[] {
  const turboVersion = pinnedTurboVersion(rootDir)
  const raw = execFileSync(
    pnpmBin,
    ['dlx', `turbo@${turboVersion}`, 'run', 'test', `--filter=...[${baseSha}]`, '--dry=json'],
    {cwd: rootDir, encoding: 'utf8', maxBuffer: 20_000_000},
  )
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed) || !Array.isArray(parsed.packages))
    throw new Error('turbo dry-run output is missing a .packages array')
  return parsed.packages.filter((entry): entry is string => typeof entry === 'string' && entry !== '//')
}

export function computeAffected(rootDir: string, options: {pnpmBin?: string} = {}): AffectedComputation {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request')
    return {affected: null, baseSha: null, rail: 'rail-1-not-a-pull-request: full set'}
  try {
    const baseSha = gitOutput(rootDir, ['merge-base', 'origin/main', 'HEAD'])
    if (baseSha === '') throw new Error('git merge-base returned an empty ref')
    const changedFiles = gitOutput(rootDir, ['diff', '--name-only', baseSha, 'HEAD'])
      .split('\n')
      .filter((line) => line !== '')
    const globalMatch = matchedGlobalFile(changedFiles, globalDependencyPatterns(rootDir))
    if (globalMatch !== null)
      return {affected: null, baseSha, rail: `rail-3-global-file-changed(${globalMatch}): full set`}
    const affected = turboAffectedPackageNames(rootDir, baseSha, options.pnpmBin ?? 'pnpm')
    return {affected, baseSha, rail: 'affected-only'}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {affected: null, baseSha: null, rail: `rail-2-fail-open(${message}): full set`}
  }
}

function logAffectedSummary(computation: AffectedComputation, candidateCount: number, selectedCount: number): void {
  const skipped = candidateCount - selectedCount
  process.stderr.write(
    `[ci-shards] base=${computation.baseSha ?? 'n/a'} considered=${candidateCount} selected=${selectedCount} skipped=${skipped} rail=${computation.rail}\n`,
  )
}

function plan(args: string[]): void {
  const rootDir = process.cwd()
  const baseline = readBoundedTimings(argValue(args, '--timings'))
  const config = taskConfig(args)
  const candidates = config.candidates(rootDir)
  const computation = computeAffected(rootDir)
  const selected = affectedPackages(candidates, computation.affected)
  logAffectedSummary(computation, candidates.length, selected.length)
  const shards = config.pack(selected, baseline)
  const include = shards.map((shard) => ({...shard, packages: shard.packages.join(' ')}))
  const matrix = JSON.stringify({include})
  const hasWork = shards.length > 0
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath !== undefined) {
    appendFileSync(outputPath, `matrix=${matrix}\n`)
    appendFileSync(outputPath, `has-work=${hasWork}\n`)
  }
  process.stdout.write(`${matrix}\n`)
}

function run(args: string[]): void {
  const packages = (process.env.SHARD_PACKAGES ?? '').split(' ').filter((name) => name !== '')
  if (packages.length === 0) throw new Error('SHARD_PACKAGES is empty; nothing to run')
  const filters = packages.map((name) => `--filter=${name}`)
  execFileSync('pnpm', ['exec', 'turbo', 'run', ...taskConfig(args).turboTasks, ...filters], {stdio: 'inherit'})
}

function report(args: string[]): void {
  const outputPath = argValue(args, '--output') ?? 'shard-report.json'
  writeFileSync(outputPath, `${JSON.stringify(loadSummaries(taskConfig(args).reportRoots))}\n`)
}

const MAX_REPORT_BYTES = 20_000_000

function readReports(dir: string): PackageSummary[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).size > MAX_REPORT_BYTES) {
        process.stderr.write(`skipping oversized shard report: ${path}\n`)
        return []
      }
      return parseSummaries(readFileSync(path, 'utf8'))
    })
}

function summarize(args: string[]): void {
  const merged = mergeSummaries(positionals(args).flatMap(readReports))
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  const rendered = renderSummary(merged, taskConfig(args).render)
  if (summaryPath === undefined) process.stdout.write(rendered)
  if (summaryPath !== undefined) appendFileSync(summaryPath, rendered)
  const timingsPath = argValue(args, '--timings')
  if (timingsPath === null) return
  const measured = Object.fromEntries(
    merged
      .map((summary): [string, number] => [summary.name, Math.round(summary.timeMs)])
      .toSorted(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(timingsPath, `${JSON.stringify(measured, null, 2)}\n`)
}

function runCli(): void {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'plan') plan(rest)
  if (command === 'run') run(rest)
  if (command === 'report') report(rest)
  if (command === 'summarize') summarize(rest)
  if (command !== 'plan' && command !== 'run' && command !== 'report' && command !== 'summarize') {
    process.stderr.write('usage: conciv-ci-shards <plan|run|report|summarize> [--task test|e2e]\n')
    process.exitCode = 2
  }
}

const entrypointArg = process.argv[1]
if (entrypointArg !== undefined && import.meta.url === pathToFileURL(entrypointArg).href) runCli()
