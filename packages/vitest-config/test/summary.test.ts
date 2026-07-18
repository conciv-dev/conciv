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
      {fullName: 'adds numbers', status: 'passed', failureMessages: [], duration: 12},
      {
        fullName: 'formats output',
        status: overrides.status ?? 'passed',
        failureMessages: overrides.failureMessages ?? [],
        duration: 8,
      },
    ],
  }
}

function report(overrides: {status?: string; failureMessages?: string[]; fileStatus?: string; message?: string}) {
  return JSON.stringify({testResults: [fileResult(overrides)]})
}

function playwrightTest(overrides: {
  status?: string
  projectName?: string
  results?: {status: string; duration: number; errors?: {message: string}[]}[]
}) {
  return {
    projectName: overrides.projectName ?? 'chromium',
    status: overrides.status ?? 'expected',
    results: overrides.results ?? [{status: 'passed', duration: 1500, errors: []}],
  }
}

function playwrightReport(overrides: {tests?: ReturnType<typeof playwrightTest>[]; errors?: {message: string}[]}) {
  return JSON.stringify({
    config: {},
    suites: [
      {
        title: 'widget.test.ts',
        specs: [{title: 'widget boots', tests: overrides.tests ?? [playwrightTest({})]}],
        suites: [],
      },
    ],
    errors: overrides.errors ?? [],
    stats: {},
  })
}

test('parseReport counts passes, failures, skips and strips ansi from failure messages', () => {
  const parsed = parseReport(
    '@conciv/demo',
    report({status: 'failed', failureMessages: ['\u001b[31mexpected 1 to be 2\u001b[39m']}),
  )
  expect(parsed).toHaveLength(1)
  expect(parsed[0]).toMatchObject({name: '@conciv/demo', passed: 1, failed: 1, skipped: 0, flaky: 0, timeMs: 2500})
  expect(parsed[0]?.cases).toContainEqual({
    title: 'formats output',
    status: 'failed',
    durationMs: 8,
    retries: 0,
    message: 'expected 1 to be 2',
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
  expect(parsed).toHaveLength(1)
  expect(parsed[0]?.failed).toBe(1)
  expect(parsed[0]?.cases).toEqual([
    {title: 'test/boom.test.ts', status: 'failed', durationMs: 5, retries: 0, message: 'transform crashed'},
  ])
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

test('parseReport parses playwright json reports with retries and stripped ansi errors', () => {
  const parsed = parseReport(
    'conciv-e2e-vite-react',
    playwrightReport({
      tests: [
        playwrightTest({}),
        playwrightTest({
          status: 'unexpected',
          results: [
            {status: 'failed', duration: 900, errors: [{message: '\u001b[31mlauncher not visible\u001b[39m'}]},
            {status: 'failed', duration: 800, errors: []},
          ],
        }),
      ],
    }),
  )
  expect(parsed).toHaveLength(1)
  expect(parsed[0]).toMatchObject({name: 'conciv-e2e-vite-react', passed: 1, failed: 1, flaky: 0, timeMs: 3200})
  expect(parsed[0]?.cases).toContainEqual({
    title: 'widget.test.ts › widget boots',
    status: 'failed',
    durationMs: 1700,
    retries: 1,
    message: 'launcher not visible',
  })
})

test('parseReport splits playwright multi-project reports into per-project rows', () => {
  const parsed = parseReport(
    'conciv-e2e-harnesses',
    playwrightReport({
      tests: [playwrightTest({projectName: 'claude'}), playwrightTest({projectName: 'codex', status: 'flaky'})],
    }),
  ).toSorted((a, b) => a.name.localeCompare(b.name))
  expect(parsed.map((summary) => ({name: summary.name, passed: summary.passed, flaky: summary.flaky}))).toEqual([
    {name: 'conciv-e2e-harnesses (claude)', passed: 1, flaky: 0},
    {name: 'conciv-e2e-harnesses (codex)', passed: 0, flaky: 1},
  ])
})

test('parseReport surfaces playwright global errors as failures', () => {
  const parsed = parseReport(
    'conciv-e2e-astro',
    JSON.stringify({config: {}, suites: [], errors: [{message: 'web server timed out'}], stats: {}}),
  )
  const failed = parsed.find((summary) => summary.failed > 0)
  expect(failed?.cases).toContainEqual({
    title: 'playwright run',
    status: 'failed',
    durationMs: 0,
    retries: 0,
    message: 'web server timed out',
  })
})

test('renderSummary with details renders one collapsible per-test table per package', () => {
  const parsed = parseReport(
    'conciv-e2e-vite-react',
    playwrightReport({
      tests: [
        playwrightTest({}),
        playwrightTest({
          status: 'unexpected',
          results: [{status: 'failed', duration: 900, errors: [{message: 'boom <tag>'}]}],
        }),
      ],
    }),
  )
  const output = renderSummary(parsed, {details: true, title: 'E2e consumer apps'})
  expect(output).toContain('## E2e consumer apps')
  expect(output).toContain('<details open>')
  expect(output).toContain('<summary>❌ <code>conciv-e2e-vite-react</code> · 1 passed · 1 failed ·')
  expect(output).toContain('<tr><th>Test</th><th>Status</th><th>Duration</th><th>Retries</th></tr>')
  expect(output).toContain('<td>✅ passed</td>')
  expect(output).toContain('<pre>boom &lt;tag&gt;</pre>')
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
  expect(output).toContain('| ✅ @conciv/green | 2 |  |  |  | 50.0% |')
  expect(output).toContain('<summary>❌ <code>@conciv/red</code> formats output</summary>')
  expect(output).toContain('boom')
})
