#!/usr/bin/env node
import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs'
import {measureSizes, parseSizes, renderSizes} from './measure.ts'

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  const value = index === -1 ? undefined : process.argv[index + 1]
  return value === undefined ? null : value
}

const outputPath = argValue('--output')
const baselinePath = argValue('--baseline')
const sizes = measureSizes(process.cwd())
if (outputPath !== null) writeFileSync(outputPath, `${JSON.stringify(sizes, null, 2)}\n`)
const baseline =
  baselinePath !== null && existsSync(baselinePath) ? parseSizes(readFileSync(baselinePath, 'utf8')) : null
const output = renderSizes(sizes, baseline)
const summaryPath = process.env.GITHUB_STEP_SUMMARY
if (summaryPath) appendFileSync(summaryPath, output)
if (!summaryPath) process.stdout.write(output)
