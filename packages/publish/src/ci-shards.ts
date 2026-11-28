#!/usr/bin/env node
import {execFileSync} from 'node:child_process'
import {appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {
  type AffectedSelection,
  readDryRunPackages,
  readTurboVersion,
  renderPlanSummary,
  selectAffected,
} from './affected.ts'
import {
  e2ePackages,
  type E2eShardPlan,
  parseTimings,
  planE2eShards,
  planShards,
  plannedPackages,
  readPackagePart,
  type ShardPlan,
  type WorkspacePackage,
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

const VALUE_FLAGS = ['--timings', '--task', '--output', '--coverage', '--coverage-output', '--untested']

type TaskConfig = {
  turboRuns: string[][]
  reportRoots: string[]
  render: Partial<RenderOptions>
  affectedTasks: string[]
  candidates: (rootDir: string) => WorkspacePackage[]
  pack: (packages: WorkspacePackage[], timings: Record<string, number>) => (ShardPlan | E2eShardPlan)[]
}

const E2E_APPS_CONCURRENCY = '50%'

const TASKS: Record<string, TaskConfig> = {
  test: {
    turboRuns: [['typecheck', 'test', '--continue=dependencies-successful']],
    reportRoots: ['packages', 'apps'],
    render: {},
    affectedTasks: ['typecheck', 'test'],
    candidates: plannedPackages,
    pack: (packages, timings) => planShards(packages, timings),
  },
  e2e: {
    turboRuns: [
      ['typecheck', '--continue'],
      ['test:e2e', '--continue', `--concurrency=${E2E_APPS_CONCURRENCY}`],
    ],
    reportRoots: ['e2e', 'apps/site'],
    render: {title: 'E2e consumer apps', details: true},
    affectedTasks: ['typecheck', 'test:e2e'],
    candidates: e2ePackages,
    pack: planE2eShards,
  },
}

function argValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag)
  if (index === -1 || index + 1 >= args.length) return null
  return args[index + 1] ?? null
}

function argValues(args: string[], flag: string): string[] {
  return args.flatMap((arg, index) => (arg === flag && index + 1 < args.length ? [args[index + 1] ?? ''] : []))
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

function git(rootDir: string, args: string[]): string {
  return execFileSync('git', args, {cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
}

function queryAffected(rootDir: string, tasks: string[], fromSha: string, toSha: string): string[] {
  const turboVersion = readTurboVersion(readFileSync(join(rootDir, 'pnpm-lock.yaml'), 'utf8'))
  const raw = execFileSync('pnpm', ['dlx', `turbo@${turboVersion}`, 'run', ...tasks, '--affected', '--dry=json'], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 50_000_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, TURBO_SCM_BASE: fromSha, TURBO_SCM_HEAD: toSha},
  })
  return readDryRunPackages(raw)
}

function selectPackages(rootDir: string, tasks: string[]): AffectedSelection {
  return selectAffected(
    {name: process.env.GITHUB_EVENT_NAME, baseSha: process.env.PR_BASE_SHA, headSha: process.env.PR_HEAD_SHA},
    {
      mergeBase: (baseSha, headSha) => git(rootDir, ['merge-base', baseSha, headSha]),
      changedFiles: (fromSha, toSha) =>
        git(rootDir, ['diff', '--name-only', fromSha, toSha])
          .split('\n')
          .filter((file) => file !== ''),
      affectedPackages: (fromSha, toSha) => queryAffected(rootDir, tasks, fromSha, toSha),
    },
  )
}

const STORYBOOK_PACKAGE = 'conciv-storybook'

function plan(args: string[]): void {
  const rootDir = process.cwd()
  const baseline = argValues(args, '--timings').reduce<Record<string, number>>(
    (merged, path) => ({...merged, ...readBoundedTimings(path)}),
    {},
  )
  const config = taskConfig(args)
  const candidates = config.candidates(rootDir)
  const selection = selectPackages(rootDir, config.affectedTasks)
  const affected = selection.packages
  const selected = affected === null ? candidates : candidates.filter(({name}) => affected.includes(name))
  const shards = config.pack(selected, baseline)
  const include = shards.map((shard) => ({...shard, packages: shard.packages.join(' ')}))
  const matrix = JSON.stringify({include})
  const storybook = affected === null || affected.includes(STORYBOOK_PACKAGE)
  const summary = renderPlanSummary(
    config.render.title ?? 'Package tests',
    selection,
    selected.map(({name}) => name),
    candidates.length,
  )
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath !== undefined)
    appendFileSync(outputPath, `matrix=${matrix}\nhas-work=${shards.length > 0}\nstorybook=${storybook}\n`)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath !== undefined) appendFileSync(summaryPath, summary)
  process.stdout.write(`${summary}${matrix}\n`)
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
  if (entries.length === 0) throw new Error('SHARD_PACKAGES is empty; nothing to run')
  const runs = taskConfig(args).turboRuns
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
  if (whole.length > 0) for (const tasks of runs) attempt(() => turbo(tasks, whole))
  for (const {name, part} of parts) {
    if (part === null) continue
    const checks = runs.flat().filter((task) => task !== 'test' && !task.startsWith('--'))
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
} else chosen(rest)
