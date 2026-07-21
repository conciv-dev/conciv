#!/usr/bin/env node
import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs'
import {
  WORKER_LIMIT_KIB,
  formatWorkerOverBudget,
  measureSizes,
  measureWorker,
  parseSizes,
  renderSizes,
} from './measure.ts'

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  const value = index === -1 ? undefined : process.argv[index + 1]
  return value === undefined ? null : value
}

const outputPath = argValue('--output')
const baselinePath = argValue('--baseline')
const worker = measureWorker(process.cwd())
if (!worker) throw new Error('site worker output is missing; build the site before measuring bundle sizes')
const sizes = [worker.size, ...measureSizes(process.cwd())]
if (outputPath !== null) writeFileSync(outputPath, `${JSON.stringify(sizes, null, 2)}\n`)
const baseline =
  baselinePath !== null && existsSync(baselinePath) ? parseSizes(readFileSync(baselinePath, 'utf8')) : null
const output = renderSizes(sizes, baseline)
const summaryPath = process.env.GITHUB_STEP_SUMMARY
if (summaryPath) appendFileSync(summaryPath, output)
if (!summaryPath) process.stdout.write(output)

if (worker && worker.size.gzip > WORKER_LIMIT_KIB * 1024) {
  process.stderr.write(`\n${formatWorkerOverBudget(worker, WORKER_LIMIT_KIB)}\n`)
  process.exit(1)
}
