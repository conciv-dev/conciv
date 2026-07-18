#!/usr/bin/env node
import {execFileSync} from 'node:child_process'
import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs'
import {discoverPackages, mergeTimings, parseTimings, planShards} from './shards.ts'
import {loadSummaries} from './summary.ts'

const PACKAGE_GROUPS = ['packages', 'packages/extensions']

function argValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag)
  if (index === -1 || index + 1 >= args.length) return null
  return args[index + 1] ?? null
}

function plan(args: string[]): void {
  const timingsPath = argValue(args, '--timings')
  const baseline =
    timingsPath !== null && existsSync(timingsPath) ? parseTimings(readFileSync(timingsPath, 'utf8')) : {}
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

function timings(args: string[]): void {
  const outputPath = argValue(args, '--output') ?? 'test-timings.json'
  const measured = Object.fromEntries(
    loadSummaries(['packages'])
      .map((summary): [string, number] => [summary.name, Math.round(summary.timeMs)])
      .toSorted(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(outputPath, `${JSON.stringify(measured, null, 2)}\n`)
}

function mergeTimingFiles(args: string[]): void {
  const outputPath = argValue(args, '--output') ?? 'ci-test-timings.json'
  const inputs = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--output')
  const merged = mergeTimings(inputs.map((path) => parseTimings(readFileSync(path, 'utf8'))))
  writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'plan') plan(rest)
if (command === 'run') run()
if (command === 'timings') timings(rest)
if (command === 'merge-timings') mergeTimingFiles(rest)
if (command !== 'plan' && command !== 'run' && command !== 'timings' && command !== 'merge-timings') {
  process.stderr.write('usage: conciv-ci-shards <plan|run|timings|merge-timings>\n')
  process.exitCode = 2
}
