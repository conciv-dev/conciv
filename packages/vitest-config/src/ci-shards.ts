#!/usr/bin/env node
import {execFileSync} from 'node:child_process'
import {appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {discoverPackages, parseTimings, planShards} from './shards.ts'
import {loadSummaries, mergeSummaries, type PackageSummary, parseSummaries, renderSummary} from './summary.ts'

const PACKAGE_GROUPS = ['packages', 'packages/extensions']

function argValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag)
  if (index === -1 || index + 1 >= args.length) return null
  return args[index + 1] ?? null
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
  const shards = planShards(discoverPackages(process.cwd(), PACKAGE_GROUPS), baseline)
  const include = shards.map((shard) => ({...shard, packages: shard.packages.join(' ')}))
  const matrix = JSON.stringify({include})
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath !== undefined) appendFileSync(outputPath, `matrix=${matrix}\n`)
  process.stdout.write(`${matrix}\n`)
}

function run(): void {
  const packages = (process.env.SHARD_PACKAGES ?? '').split(' ').filter((name) => name !== '')
  if (packages.length === 0) throw new Error('SHARD_PACKAGES is empty; nothing to run')
  const filters = packages.map((name) => `--filter=${name}`)
  execFileSync('pnpm', ['exec', 'turbo', 'run', 'typecheck', 'lint', 'test', ...filters], {stdio: 'inherit'})
}

function report(args: string[]): void {
  const outputPath = argValue(args, '--output') ?? 'shard-report.json'
  writeFileSync(outputPath, `${JSON.stringify(loadSummaries(['packages']))}\n`)
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
  const inputs = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--timings')
  const merged = mergeSummaries(inputs.flatMap(readReports))
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  const rendered = renderSummary(merged)
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

const [command, ...rest] = process.argv.slice(2)
if (command === 'plan') plan(rest)
if (command === 'run') run()
if (command === 'report') report(rest)
if (command === 'summarize') summarize(rest)
if (command !== 'plan' && command !== 'run' && command !== 'report' && command !== 'summarize') {
  process.stderr.write('usage: conciv-ci-shards <plan|run|report|summarize>\n')
  process.exitCode = 2
}
