import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import {
  loadSummaries,
  mergeSummaries,
  type PackageSummary,
  parseReport,
  parseSummaries,
  renderSummary,
} from '../src/summary.ts'

let root = ''

afterEach(async () => {
  if (root !== '') await rm(root, {recursive: true, force: true})
  root = ''
})

function fileResult(overrides: {
  name?: string
  status?: string
  failureMessages?: string[]
  fileStatus?: string
  message?: string
}) {
  return {
    name: overrides.name ?? '/repo/packages/demo/test/demo.test.ts',
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
  }
}

function report(overrides: {status?: string; failureMessages?: string[]; fileStatus?: string; message?: string}) {
  return JSON.stringify({testResults: [fileResult(overrides)]})
}

test('parseReport counts passes, failures, skips and strips ansi from failure messages', () => {
  const parsed = parseReport(
    '@conciv/demo',
    report({status: 'failed', failureMessages: ['[31mexpected 1 to be 2[39m']}),
  )
  expect(parsed).toEqual([
    {
      name: '@conciv/demo',
      passed: 1,
      failed: 1,
      skipped: 0,
      timeMs: 2500,
      failures: [{test: 'formats output', message: 'expected 1 to be 2'}],
      coverage: null,
    },
  ])
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
  expect(parsed).toHaveLength(1)
  expect(parsed[0]?.failed).toBe(1)
  expect(parsed[0]?.failures).toEqual([{test: 'test/boom.test.ts', message: 'transform crashed'}])
})

test('parseReport splits one report by the workspace package owning each test file', async () => {
  root = await mkdtemp(join(tmpdir(), 'conciv-ci-summary-'))
  for (const {dir, name} of [
    {dir: 'packages/ui-kit-chat', name: '@conciv/ui-kit-chat'},
    {dir: 'packages/ui-kit-system', name: '@conciv/ui-kit-system'},
  ]) {
    await mkdir(join(root, dir, 'src'), {recursive: true})
    await writeFile(join(root, dir, 'package.json'), JSON.stringify({name}))
  }
  const raw = JSON.stringify({
    testResults: [
      fileResult({name: join(root, 'packages/ui-kit-chat/src/thread.stories.tsx')}),
      fileResult({name: join(root, 'packages/ui-kit-system/src/button.stories.tsx'), status: 'failed'}),
    ],
  })
  const parsed = parseReport('conciv-storybook', raw).toSorted((a, b) => a.name.localeCompare(b.name))
  expect(parsed.map((summary) => ({name: summary.name, passed: summary.passed, failed: summary.failed}))).toEqual([
    {name: '@conciv/ui-kit-chat', passed: 2, failed: 0},
    {name: '@conciv/ui-kit-system', passed: 1, failed: 1},
  ])
})

test('loadSummaries discovers reports, attaches per-package coverage, and renders one table', async () => {
  root = await mkdtemp(join(tmpdir(), 'conciv-ci-summary-'))
  for (const {dir, name, status} of [
    {dir: 'packages/green', name: '@conciv/green', status: 'passed'},
    {dir: 'packages/red', name: '@conciv/red', status: 'failed'},
  ]) {
    await mkdir(join(root, dir, 'coverage'), {recursive: true})
    await writeFile(join(root, dir, 'package.json'), JSON.stringify({name}))
    await writeFile(
      join(root, dir, 'test-results.json'),
      report(status === 'failed' ? {status, failureMessages: ['boom']} : {}),
    )
    await writeFile(
      join(root, dir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: {lines: {total: 10, covered: 5, pct: 50}},
        [join(root, dir, 'src/index.ts')]: {lines: {total: 10, covered: 5, pct: 50}},
      }),
    )
  }
  const summaries = loadSummaries([join(root, 'packages')])
  const output = renderSummary(summaries)
  expect(summaries.map((summary) => summary.name).toSorted()).toEqual(['@conciv/green', '@conciv/red'])
  expect(output).toContain('❌ **1 failed** · 3 passed')
  expect(output).toContain('50.0% line coverage')
  expect(output.indexOf('❌ @conciv/red')).toBeLessThan(output.indexOf('✅ @conciv/green'))
  expect(output).toContain('| ✅ @conciv/green | 2 |  |  | 50.0% |')
  expect(output).toContain('<summary>❌ <code>@conciv/red</code> formats output</summary>')
  expect(output).toContain('boom')
})

test('shard reports survive a JSON round trip and merge into one table', () => {
  const shardOne: PackageSummary[] = [
    {
      name: '@conciv/alpha',
      passed: 2,
      failed: 0,
      skipped: 0,
      timeMs: 1_000,
      failures: [],
      coverage: {covered: 5, total: 10},
    },
  ]
  const shardTwo: PackageSummary[] = [
    {
      name: '@conciv/beta',
      passed: 0,
      failed: 1,
      skipped: 1,
      timeMs: 2_000,
      failures: [{test: 'explodes', message: 'boom'}],
      coverage: null,
    },
  ]
  const merged = mergeSummaries([shardOne, shardTwo].flatMap((shard) => parseSummaries(JSON.stringify(shard))))
  expect(merged).toEqual([...shardOne, ...shardTwo])
  const output = renderSummary(merged)
  expect(output).toContain('❌ **1 failed** · 2 passed · 3.0s')
  expect(output).toContain('✅ @conciv/alpha')
  expect(output).toContain('boom')
})

test('parseSummaries tolerates a truncated or malformed shard report', () => {
  expect(parseSummaries('[]')).toEqual([])
  expect(parseSummaries('{"not": "an array"}')).toEqual([])
  expect(parseSummaries('[{"name": "@conciv/partial"}]')).toEqual([
    {name: '@conciv/partial', passed: 0, failed: 0, skipped: 0, timeMs: 0, failures: [], coverage: null},
  ])
})

test('a failure message cannot break out of its code fence to inject markdown', () => {
  const output = renderSummary([
    {
      name: '@conciv/x',
      passed: 0,
      failed: 1,
      skipped: 0,
      timeMs: 1,
      failures: [{test: 't', message: '```\n## injected heading\n```'}],
      coverage: null,
    },
  ])
  const body = output.slice(output.indexOf('</summary>'))
  expect(body).toContain('````\n```\n## injected heading\n```\n````')
  expect(body.split('\n').some((line) => line.startsWith('## injected'))).toBe(true)
  expect(output.indexOf('## injected')).toBeGreaterThan(output.indexOf('````'))
})

test('an enormous failure message is truncated so it cannot blow the job-summary limit', () => {
  const output = renderSummary([
    {
      name: '@conciv/x',
      passed: 0,
      failed: 1,
      skipped: 0,
      timeMs: 1,
      failures: [{test: 't', message: 'x'.repeat(20_000)}],
      coverage: null,
    },
  ])
  expect(output).toContain('… truncated 12000 characters')
  expect(output.length).toBeLessThan(10_000)
})

test('loadSummaries never descends into node_modules', async () => {
  root = await mkdtemp(join(tmpdir(), 'conciv-ci-summary-'))
  await mkdir(join(root, 'packages/victim/node_modules/malicious'), {recursive: true})
  await writeFile(join(root, 'packages/victim/package.json'), JSON.stringify({name: '@conciv/victim'}))
  await writeFile(join(root, 'packages/victim/test-results.json'), report({}))
  await writeFile(join(root, 'packages/victim/node_modules/malicious/test-results.json'), report({status: 'failed'}))
  const summaries = loadSummaries([join(root, 'packages')])
  expect(summaries).toHaveLength(1)
  expect(summaries[0]?.failed).toBe(0)
})
