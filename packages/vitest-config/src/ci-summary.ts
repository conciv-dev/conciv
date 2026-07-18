#!/usr/bin/env node
import {appendFileSync} from 'node:fs'
import {loadSummaries, renderSummary} from './summary.ts'

const roots = process.argv.slice(2)
const output = renderSummary(loadSummaries(roots.length > 0 ? roots : ['packages']))
const summaryPath = process.env.GITHUB_STEP_SUMMARY
if (summaryPath) appendFileSync(summaryPath, output)
if (!summaryPath) process.stdout.write(output)
