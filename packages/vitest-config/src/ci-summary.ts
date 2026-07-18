#!/usr/bin/env node
import {appendFileSync} from 'node:fs'
import {parseArgs} from 'node:util'
import {loadSummaries, renderSummary} from './summary.ts'

const {values, positionals} = parseArgs({
  options: {
    details: {type: 'boolean', default: false},
    title: {type: 'string', default: 'Test results'},
  },
  allowPositionals: true,
})
const roots = positionals.length > 0 ? positionals : ['packages']
const output = renderSummary(loadSummaries(roots), {details: values.details, title: values.title})
const summaryPath = process.env.GITHUB_STEP_SUMMARY
if (summaryPath) appendFileSync(summaryPath, output)
if (!summaryPath) process.stdout.write(output)
