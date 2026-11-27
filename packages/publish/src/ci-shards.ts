#!/usr/bin/env node
import {execFileSync} from 'node:child_process'
import {appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {
  e2ePackages,
  type E2eShardPlan,
  parseTimings,
  planE2eShards,
  planShards,
  plannedPackages,
  readPackagePart,
  type ShardPlan,
} from './shards.ts'
import {
  findFiles,
  loadSummaries,
  manifestName,
  coverageByPackage,
  coverageOnlySummary,
  isWorkspaceSource,
  mergeLcov,
  rebaseLcov,
  mergeSummaries,
  type PackageSummary,
  parseSummaries,
  type RenderOptions,
  renderSummary,
} from './summary.ts'
import {publishErrors} from './errors/errors.ts'
import {formatCliError} from './errors/format.ts'

const VALUE_FLAGS = ['--timings', '--task', '--output', '--coverage', '--coverage-output', '--untested']

type TaskConfig = {
  turboTasks: string[]
  reportRoots: string[]
  render: Partial<RenderOptions>
  plan: (rootDir: string, timings: Record<string, number>) => (ShardPlan | E2eShardPlan)[]
}

const TASKS: Record<string, TaskConfig> = {
  test: {
    turboTasks: ['typecheck', 'test', '--continue=dependencies-successful'],
    reportRoots: ['packages', 'apps'],
    render: {},
    plan: (rootDir, timings) => planShards(plannedPackages(rootDir), timings),
  },
  e2e: {
    turboTasks: ['typecheck', 'test:e2e', '--continue'],
    reportRoots: ['e2e', 'apps/site'],
    render: {title: 'E2e consumer apps', details: true},
    plan: (rootDir, timings) => planE2eShards(e2ePackages(rootDir), timings),
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
  if (config === undefined) throw publishErrors.UNKNOWN_TASK({requested, expected: Object.keys(TASKS).join(' or ')})
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

function plan(args: string[]): void {
  const baseline = readBoundedTimings(argValue(args, '--timings'))
  const shards = taskConfig(args).plan(process.cwd(), baseline)
  const include = shards.map((shard) => ({...shard, packages: shard.packages.join(' ')}))
  const matrix = JSON.stringify({include})
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath !== undefined) appendFileSync(outputPath, `matrix=${matrix}\n`)
  process.stdout.write(`${matrix}\n`)
}

function turbo(tasks: string[], filters: string[], passed: string[] = []): void {
  execFileSync(
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      '--log-order=stream',
      '--log-prefix=task',
      ...tasks,
      ...filters,
      ...(passed.length > 0 ? ['--', ...passed] : []),
    ],
    {
      stdio: 'inherit',
    },
  )
}

function run(args: string[]): void {
  const entries = (process.env.SHARD_PACKAGES ?? '').split(' ').filter((name) => name !== '')
  if (entries.length === 0) throw publishErrors.SHARD_PACKAGES_EMPTY()
  const tasks = taskConfig(args).turboTasks
  const parts = entries.map(readPackagePart)
  const whole = parts.flatMap(({name, part}) => (part === null ? [`--filter=${name}`] : []))
  const failures: unknown[] = []
  const attempt = (step: () => void) => {
    try {
      step()
    } catch (error) {
      failures.push(error)
    }
  }
  if (whole.length > 0) attempt(() => turbo(tasks, whole))
  for (const {name, part} of parts) {
    if (part === null) continue
    const checks = tasks.filter((task) => task !== 'test' && !task.startsWith('--'))
    if (part.index === 1 && checks.length > 0) attempt(() => turbo(checks, [`--filter=${name}`]))
    attempt(() => turbo(['test'], [`--filter=${name}`], [`--shard=${part.index}/${part.count}`]))
  }
  if (failures.length > 0) throw new AggregateError(failures, `${failures.length} turbo run(s) failed in this shard`)
}

function report(args: string[]): void {
  const outputPath = argValue(args, '--output') ?? 'shard-report.json'
  writeFileSync(outputPath, `${JSON.stringify(loadSummaries(taskConfig(args).reportRoots))}\n`)
}

const PACKAGE_DIR_SEPARATOR = '__'

function coverage(args: string[]): void {
  const outputDir = argValue(args, '--output') ?? 'coverage-report'
  for (const lcov of findFiles(taskConfig(args).reportRoots, 'lcov.info')) {
    const reportDir = dirname(lcov)
    if (basename(reportDir) !== 'coverage') continue
    const packageDir = dirname(reportDir)
    const target = join(outputDir, manifestName(packageDir).replaceAll('/', PACKAGE_DIR_SEPARATOR))
    mkdirSync(target, {recursive: true})
    writeFileSync(join(target, 'lcov.info'), rebaseLcov(readFileSync(lcov, 'utf8'), packageDir, process.cwd()))
  }
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

function untestedRoots(args: string[]): string[] {
  const untestedDir = argValue(args, '--untested')
  return untestedDir !== null && existsSync(untestedDir) ? [untestedDir] : []
}

function withCoverage(summaries: PackageSummary[], args: string[]): PackageSummary[] {
  const coverageDir = argValue(args, '--coverage')
  if (coverageDir === null || !existsSync(coverageDir)) return summaries
  const merged = mergeLcov(
    findFiles([coverageDir], 'lcov.info').map((path) => readFileSync(path, 'utf8')),
    isWorkspaceSource,
    findFiles(untestedRoots(args), 'lcov.info').map((path) => readFileSync(path, 'utf8')),
  )
  const outputDir = argValue(args, '--coverage-output')
  if (outputDir !== null) {
    mkdirSync(outputDir, {recursive: true})
    writeFileSync(join(outputDir, 'lcov.info'), merged.lcov)
  }
  const byPackage = coverageByPackage(merged.files, process.cwd())
  const tested = new Set(summaries.map((summary) => summary.name))
  return [
    ...summaries.map((summary) => ({...summary, coverage: byPackage.get(summary.name) ?? null})),
    ...[...byPackage.entries()]
      .filter(([name]) => !tested.has(name))
      .map(([name, packageCoverage]) => coverageOnlySummary(name, packageCoverage)),
  ]
}

function summarize(args: string[]): void {
  const merged = mergeSummaries(positionals(args).flatMap(readReports))
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  const rendered = renderSummary(withCoverage(merged, args), taskConfig(args).render)
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

const COMMANDS: Record<string, (args: string[]) => void> = {plan, run, report, coverage, summarize}

const [command = '', ...rest] = process.argv.slice(2)
const chosen = COMMANDS[command]
if (chosen === undefined) {
  process.stderr.write(`usage: conciv-ci-shards <${Object.keys(COMMANDS).join('|')}> [--task test|e2e]\n`)
  process.exitCode = 2
} else {
  try {
    chosen(rest)
  } catch (error) {
    process.stderr.write(`${formatCliError(error)}\n`)
    process.exitCode = 1
  }
}
