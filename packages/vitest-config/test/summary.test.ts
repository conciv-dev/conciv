import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import {loadSummaries, parseReport, renderSummary} from '../src/summary.ts'

let root = ''

afterEach(async () => {
  if (root !== '') await rm(root, {recursive: true, force: true})
  root = ''
})

function report(overrides: {status?: string; failureMessages?: string[]; fileStatus?: string; message?: string}) {
  return JSON.stringify({
    testResults: [
      {
        name: '/repo/packages/demo/test/demo.test.ts',
        status: overrides.fileStatus ?? 'passed',
        message: overrides.message ?? '',
        startTime: 1000,
        endTime: 3500,
        assertionResults: [
          {fullName: 'adds numbers', status: 'passed', failureMessages: []},
          {
            fullName: 'formats output',
            status: overrides.status ?? 'passed',
            failureMessages: overrides.failureMessages ?? [],
          },
        ],
      },
    ],
  })
}

test('parseReport counts passes, failures, skips and strips ansi from failure messages', () => {
  const parsed = parseReport(
    '@conciv/demo',
    report({status: 'failed', failureMessages: ['[31mexpected 1 to be 2[39m']}),
  )
  expect(parsed).toEqual({
    name: '@conciv/demo',
    passed: 1,
    failed: 1,
    skipped: 0,
    timeMs: 2500,
    failures: [{test: 'formats output', message: 'expected 1 to be 2'}],
  })
})

test('parseReport surfaces file-level errors when no assertion ran', () => {
  const parsed = parseReport(
    '@conciv/demo',
    JSON.stringify({
      testResults: [
        {
          name: 'test/boom.test.ts',
          status: 'failed',
          message: 'transform crashed',
          startTime: 0,
          endTime: 5,
          assertionResults: [],
        },
      ],
    }),
  )
  expect(parsed.failed).toBe(1)
  expect(parsed.failures).toEqual([{test: 'test/boom.test.ts', message: 'transform crashed'}])
})

test('loadSummaries discovers reports next to their package manifests and renders one table', async () => {
  root = await mkdtemp(join(tmpdir(), 'conciv-ci-summary-'))
  for (const {dir, name, status} of [
    {dir: 'packages/green', name: '@conciv/green', status: 'passed'},
    {dir: 'packages/red', name: '@conciv/red', status: 'failed'},
  ]) {
    await mkdir(join(root, dir), {recursive: true})
    await writeFile(join(root, dir, 'package.json'), JSON.stringify({name}))
    await writeFile(
      join(root, dir, 'test-results.json'),
      report(status === 'failed' ? {status, failureMessages: ['boom']} : {}),
    )
  }
  const summaries = loadSummaries([join(root, 'packages')])
  const output = renderSummary(summaries)
  expect(summaries.map((summary) => summary.name)).toEqual(['@conciv/green', '@conciv/red'])
  expect(output).toContain('❌ **1 failed** · 3 passed')
  expect(output.indexOf('❌ @conciv/red')).toBeLessThan(output.indexOf('✅ @conciv/green'))
  expect(output).toContain('<summary>❌ <code>@conciv/red</code> formats output</summary>')
  expect(output).toContain('boom')
})
