import {afterEach, expect, test, vi, describe} from 'vitest'
import {ciReporters, ciTest} from '../src/reporters.ts'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  DEFAULT_PACKAGE_MS,
  discoverPackages,
  E2E_HARNESS_PACKAGE,
  E2E_SHARD_SIZING,
  e2ePackages,
  PACKAGE_GROUPS,
  PACKAGES_WITH_DEDICATED_JOBS,
  parseTimings,
  planE2eShards,
  planShards,
  plannedPackages,
  TARGET_SHARD_MS,
  type WorkspacePackage,
} from '../src/shards.ts'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {
  loadSummaries,
  mergeSummaries,
  type PackageSummary,
  parseReport,
  parseSummaries,
  renderSummary,
} from '../src/summary.ts'

describe('reporters', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('local runs keep the default reporter only and disable coverage', () => {
    vi.stubEnv('GITHUB_ACTIONS', undefined)
    expect(ciReporters()).toEqual(['default'])
    expect(ciTest().coverage.enabled).toBe(false)
  })

  test('CI runs add json results and annotation reporters without the noisy job summary', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    expect(ciReporters()).toEqual([
      'default',
      ['github-actions', {jobSummary: {enabled: false}}],
      ['json', {outputFile: 'test-results.json'}],
    ])
  })

  test('CI runs collect v8 line coverage into a json summary', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    vi.stubEnv('VITEST_MAX_FORKS', undefined)
    expect(ciTest()).toEqual({
      reporters: ciReporters(),
      testTimeout: 30_000,
      hookTimeout: 30_000,
      teardownTimeout: 30_000,
      coverage: {enabled: true, provider: 'v8', reporter: ['json-summary'], reportsDirectory: 'coverage'},
    })
  })

  test('a fork cap in the environment caps the worker count', () => {
    vi.stubEnv('VITEST_MAX_FORKS', '2')
    expect(ciTest().maxWorkers).toBe(2)
  })

  test('a nonsense fork cap leaves the worker count to vitest', () => {
    vi.stubEnv('VITEST_MAX_FORKS', 'lots')
    expect(ciTest().maxWorkers).toBeUndefined()
  })
})

describe('shards', () => {
  function pkg(name: string, browser = false): WorkspacePackage {
    return {name, browser, e2e: false}
  }

  function e2ePkg(name: string): WorkspacePackage {
    return {name, browser: true, e2e: true}
  }

  function writeManifest(root: string, dir: string, manifest: Record<string, unknown>): void {
    mkdirSync(join(root, dir), {recursive: true})
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest))
  }

  test('discoverPackages finds workspace packages and flags browser dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'shards-'))
    writeManifest(root, 'packages/embed', {name: '@x/embed', devDependencies: {playwright: '^1'}})
    writeManifest(root, 'packages/core', {name: '@x/core', devDependencies: {vitest: '^4'}})
    writeManifest(root, 'packages/ui', {name: '@x/ui', devDependencies: {'@vitest/browser-playwright': '^4'}})
    writeManifest(root, 'packages/extensions/board', {name: '@x/board', devDependencies: {playwright: '^1'}})
    mkdirSync(join(root, 'packages', 'no-manifest'))
    expect(discoverPackages(root, ['packages', 'packages/extensions'])).toEqual([
      {name: '@x/board', browser: true, e2e: false},
      {name: '@x/core', browser: false, e2e: false},
      {name: '@x/embed', browser: true, e2e: false},
      {name: '@x/ui', browser: true, e2e: false},
    ])
  })

  test('discoverPackages rejects package names that could smuggle turbo arguments', () => {
    const root = mkdtempSync(join(tmpdir(), 'shards-'))
    writeManifest(root, 'packages/evil', {name: '--filter=... --continue'})
    expect(() => discoverPackages(root, ['packages'])).toThrow(/invalid package name/)
  })

  test('planShards partitions every package exactly once', () => {
    const packages = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => pkg(name))
    const shards = planShards(packages, {a: 100_000, b: 90_000, c: 80_000, d: 20_000, e: 10_000, f: 5_000})
    const assigned = shards.flatMap((shard) => shard.packages).toSorted()
    expect(assigned).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  test('planShards isolates a dominant package and balances the rest', () => {
    const packages = [pkg('whale', true), pkg('mid1'), pkg('mid2'), pkg('small1'), pkg('small2')]
    const shards = planShards(packages, {whale: 300_000, mid1: 50_000, mid2: 45_000, small1: 5_000, small2: 5_000})
    const whaleShard = shards.find((shard) => shard.packages.includes('whale'))
    expect(whaleShard?.packages).toEqual(['whale'])
    expect(whaleShard?.chromium).toBe(true)
  })

  test('planShards derives chromium per shard from member dependencies', () => {
    const shards = planShards([pkg('browser-heavy', true), pkg('node-only')], {
      'browser-heavy': 200_000,
      'node-only': 200_000,
    })
    const byName = new Map(shards.map((shard) => [shard.packages.join(','), shard.chromium]))
    expect(byName.get('browser-heavy')).toBe(true)
    expect(byName.get('node-only')).toBe(false)
  })

  test('planShards scales shard count with total measured time', () => {
    const packages = Array.from({length: 10}, (_, index) => pkg(`p${index}`))
    const timings = Object.fromEntries(packages.map((entry) => [entry.name, TARGET_SHARD_MS]))
    expect(planShards(packages, timings)).toHaveLength(8)
  })

  test('planShards spreads wide without any baseline so the bootstrap run still parallelizes', () => {
    const packages = Array.from({length: 10}, (_, index) => pkg(`p${index}`))
    expect(planShards(packages, {})).toHaveLength(4)
    expect(planShards(packages, {p0: 1_000})).toHaveLength(2)
  })

  test('planShards falls back to the default weight for unmeasured packages', () => {
    const shards = planShards([pkg('known'), pkg('unknown')], {known: DEFAULT_PACKAGE_MS})
    expect(shards.flatMap((shard) => shard.packages).toSorted()).toEqual(['known', 'unknown'])
  })

  test('planShards is deterministic', () => {
    const packages = ['z', 'y', 'x', 'w'].map((name) => pkg(name))
    const timings = {z: 10_000, y: 10_000, x: 10_000, w: 10_000}
    expect(planShards(packages, timings)).toEqual(planShards(packages.toReversed(), timings))
  })

  test('parseTimings keeps numeric entries and drops everything else', () => {
    expect(parseTimings('{"a": 5, "b": "junk", "c": null}')).toEqual({a: 5})
    expect(parseTimings('[]')).toEqual({})
  })

  test('every real workspace package lands in a shard unless it owns a dedicated CI job', () => {
    const repoRoot = join(import.meta.dirname, '..', '..', '..')
    const planned = new Set(plannedPackages(repoRoot).map((entry) => entry.name))
    const onDisk = PACKAGE_GROUPS.flatMap((group) =>
      readdirSync(join(repoRoot, group), {withFileTypes: true})
        .filter((entry) => entry.isDirectory() && existsSync(join(repoRoot, group, entry.name, 'package.json')))
        .map((entry) => JSON.parse(readFileSync(join(repoRoot, group, entry.name, 'package.json'), 'utf8')).name),
    )
    const unplanned = onDisk.filter(
      (name) => typeof name === 'string' && !planned.has(name) && !PACKAGES_WITH_DEDICATED_JOBS.includes(name),
    )
    expect(unplanned).toEqual([])
  })

  test('the workspace apps are sharded alongside the packages', () => {
    const planned = plannedPackages(join(import.meta.dirname, '..', '..', '..')).map((entry) => entry.name)
    expect(planned).toContain('@conciv/app')
    expect(planned).toContain('site')
  })

  test('a package with a dedicated CI job is kept out of the shard matrix', () => {
    const root = mkdtempSync(join(tmpdir(), 'shards-'))
    writeManifest(root, 'apps/storybook', {name: 'conciv-storybook', version: '1.0.0'})
    writeManifest(root, 'apps/conciv', {name: '@conciv/app', version: '1.0.0'})
    expect(plannedPackages(root).map((entry) => entry.name)).toEqual(['@conciv/app'])
  })

  test('e2ePackages keeps only workspace packages that actually define a test:e2e script', () => {
    const root = mkdtempSync(join(tmpdir(), 'shards-'))
    writeManifest(root, 'e2e/vite-react', {name: 'x-e2e-vite-react', scripts: {'test:e2e': 'playwright test'}})
    writeManifest(root, 'e2e/e2e-utils', {name: '@x/e2e-utils', scripts: {build: 'tsc'}})
    writeManifest(root, 'apps/site', {name: 'site', scripts: {'test:e2e': 'vitest run'}})
    writeManifest(root, 'apps/storybook', {name: 'x-storybook', scripts: {test: 'vitest run'}})
    expect(e2ePackages(root).map((entry) => entry.name)).toEqual(['site', 'x-e2e-vite-react'])
  })

  test('every real e2e consumer app plus the site lands in the e2e matrix, and e2e-utils does not', () => {
    const names = e2ePackages(join(import.meta.dirname, '..', '..', '..')).map((entry) => entry.name)
    expect(names).toContain('conciv-e2e-vite-react')
    expect(names).toContain('conciv-e2e-init')
    expect(names).toContain(E2E_HARNESS_PACKAGE)
    expect(names).toContain('site')
    expect(names).not.toContain('@conciv/e2e-utils')
    expect(names).not.toContain('conciv-storybook')
  })

  test('planE2eShards flags only the shard that owns the harness matrix', () => {
    const packages = [e2ePkg(E2E_HARNESS_PACKAGE), e2ePkg('app-a'), e2ePkg('app-b')]
    const shards = planE2eShards(packages, {[E2E_HARNESS_PACKAGE]: 400_000, 'app-a': 200_000, 'app-b': 200_000})
    expect(shards.filter((shard) => shard.harnesses).flatMap((shard) => shard.packages)).toEqual([E2E_HARNESS_PACKAGE])
    expect(shards.flatMap((shard) => shard.packages).toSorted()).toEqual(['app-a', 'app-b', E2E_HARNESS_PACKAGE])
  })

  test('planE2eShards packs bigger bins than the package matrix so per-shard setup is not repaid too often', () => {
    const packages = Array.from({length: 12}, (_, index) => e2ePkg(`app${index}`))
    const timings = Object.fromEntries(packages.map((entry) => [entry.name, TARGET_SHARD_MS]))
    expect(planE2eShards(packages, timings).length).toBeLessThan(planShards(packages, timings).length)
    expect(planE2eShards(packages, timings)).toHaveLength(E2E_SHARD_SIZING.maxShards)
  })

  test('planE2eShards charges every app a fixed server-boot overhead the case timings never capture', () => {
    const packages = Array.from({length: 10}, (_, index) => e2ePkg(`app${index}`))
    const timings = Object.fromEntries(packages.map((entry) => [entry.name, 40_000]))
    expect(planE2eShards(packages, timings)).toHaveLength(3)
    expect(planShards(packages, timings, {...E2E_SHARD_SIZING, overheadMs: 0})).toHaveLength(2)
  })

  test('planE2eShards spreads across three shards on the bootstrap run with no baseline', () => {
    const packages = Array.from({length: 15}, (_, index) => e2ePkg(`app${index}`))
    expect(planE2eShards(packages, {})).toHaveLength(E2E_SHARD_SIZING.bootstrapShards)
  })

  test('a package.json without a usable name fails the plan instead of vanishing from it', () => {
    const root = mkdtempSync(join(tmpdir(), 'shards-'))
    writeManifest(root, 'packages/nameless', {version: '1.0.0'})
    expect(() => discoverPackages(root, ['packages'])).toThrow(/nameless/)
  })
})

describe('summary', () => {
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
    annotations?: {type: string; description?: string}[]
    results?: {
      status: string
      duration: number
      errors?: {message: string}[]
      annotations?: {type: string; description?: string}[]
    }[]
  }) {
    return {
      projectName: overrides.projectName ?? 'chromium',
      status: overrides.status ?? 'expected',
      annotations: overrides.annotations ?? [],
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
      annotations: [],
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
      {
        title: 'test/boom.test.ts',
        status: 'failed',
        durationMs: 5,
        retries: 0,
        message: 'transform crashed',
        annotations: [],
      },
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
      annotations: [],
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
      annotations: [],
    })
  })

  test('parseReport carries playwright annotations from the test and from every retry', () => {
    const parsed = parseReport(
      'conciv-e2e-harnesses',
      playwrightReport({
        tests: [
          playwrightTest({
            projectName: 'gemini-cli',
            annotations: [{type: 'turn-outcome', description: 'gemini-cli: Please set an Auth method'}],
            results: [
              {
                status: 'passed',
                duration: 1200,
                errors: [],
                annotations: [
                  {type: 'turn-outcome', description: 'gemini-cli: Please set an Auth method'},
                  {type: 'turn-outcome', description: 'gemini-cli: first attempt hung'},
                ],
              },
            ],
          }),
        ],
      }),
    )
    expect(parsed[0]?.cases[0]?.annotations).toEqual([
      {type: 'turn-outcome', description: 'gemini-cli: Please set an Auth method'},
      {type: 'turn-outcome', description: 'gemini-cli: first attempt hung'},
    ])
  })

  test('a shard report keeps the annotations of a passing case through the round trip', () => {
    const shard: PackageSummary[] = [
      {
        name: 'conciv-e2e-harnesses (codex)',
        passed: 1,
        failed: 0,
        flaky: 0,
        skipped: 0,
        timeMs: 900,
        cases: [
          {
            title: 'full app boots with the configured harness',
            status: 'passed',
            durationMs: 900,
            retries: 0,
            message: '',
            annotations: [{type: 'turn-outcome', description: 'codex: You are not signed in'}],
          },
        ],
        coverage: null,
      },
    ]
    expect(parseSummaries(JSON.stringify(shard))).toEqual(shard)
  })

  test('renderSummary with details shows the annotations of a passing case', () => {
    const output = renderSummary(
      [
        {
          name: 'conciv-e2e-harnesses (opencode)',
          passed: 1,
          failed: 0,
          flaky: 0,
          skipped: 0,
          timeMs: 900,
          cases: [
            {
              title: 'boots',
              status: 'passed',
              durationMs: 900,
              retries: 0,
              message: '',
              annotations: [{type: 'turn-outcome', description: 'opencode: no <provider> configured'}],
            },
          ],
          coverage: null,
        },
      ],
      {details: true, title: 'E2e consumer apps'},
    )
    expect(output).toContain('<pre>turn-outcome: opencode: no &lt;provider&gt; configured</pre>')
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

  test('shard reports survive a JSON round trip and merge into one table', () => {
    const shardOne: PackageSummary[] = [
      {
        name: '@conciv/alpha',
        passed: 1,
        failed: 0,
        flaky: 1,
        skipped: 0,
        timeMs: 1_000,
        cases: [
          {title: 'a', status: 'passed', durationMs: 5, retries: 0, message: '', annotations: []},
          {
            title: 'b',
            status: 'flaky',
            durationMs: 7,
            retries: 1,
            message: '',
            annotations: [{type: 'turn-outcome', description: 'claude: 401 unauthorized'}],
          },
        ],
        coverage: {covered: 5, total: 10},
      },
    ]
    const shardTwo: PackageSummary[] = [
      {
        name: '@conciv/beta',
        passed: 0,
        failed: 1,
        flaky: 0,
        skipped: 1,
        timeMs: 2_000,
        cases: [
          {title: 'explodes', status: 'failed', durationMs: 9, retries: 0, message: 'boom', annotations: []},
          {title: 'ignored', status: 'skipped', durationMs: 0, retries: 0, message: '', annotations: []},
        ],
        coverage: null,
      },
    ]
    const merged = mergeSummaries([shardOne, shardTwo].flatMap((shard) => parseSummaries(JSON.stringify(shard))))
    expect(merged).toEqual([...shardOne, ...shardTwo])
    const output = renderSummary(merged)
    expect(output).toContain('@conciv/alpha')
    expect(output).toContain('boom')
  })

  test('parseSummaries recomputes counts instead of trusting a shard report', () => {
    const [summary] = parseSummaries(
      JSON.stringify([
        {
          name: '@conciv/liar',
          passed: 9_999,
          failed: 0,
          flaky: 0,
          skipped: 0,
          timeMs: 1,
          cases: [{title: 't', status: 'failed', durationMs: 1, retries: 0, message: 'boom', annotations: []}],
          coverage: null,
        },
      ]),
    )
    expect(summary?.passed).toBe(0)
    expect(summary?.failed).toBe(1)
  })

  test('parseSummaries tolerates a truncated or malformed shard report', () => {
    expect(parseSummaries('[]')).toEqual([])
    expect(parseSummaries('{"not": "an array"}')).toEqual([])
    expect(parseSummaries('[{"name": "@conciv/partial"}]')).toEqual([
      {name: '@conciv/partial', passed: 0, failed: 0, flaky: 0, skipped: 0, timeMs: 0, cases: [], coverage: null},
    ])
  })

  test('a failure message cannot break out of its code fence to inject markdown', () => {
    const output = renderSummary([
      {
        name: '@conciv/x',
        passed: 0,
        failed: 1,
        flaky: 0,
        skipped: 0,
        timeMs: 1,
        cases: [
          {
            title: 't',
            status: 'failed',
            durationMs: 1,
            retries: 0,
            message: '```\n## injected heading\n```',
            annotations: [],
          },
        ],
        coverage: null,
      },
    ])
    const body = output.slice(output.indexOf('</summary>'))
    expect(body).toContain('````\n```\n## injected heading\n```\n````')
  })

  test('an enormous failure message is truncated so it cannot blow the job-summary limit', () => {
    const output = renderSummary([
      {
        name: '@conciv/x',
        passed: 0,
        failed: 1,
        flaky: 0,
        skipped: 0,
        timeMs: 1,
        cases: [
          {title: 't', status: 'failed', durationMs: 1, retries: 0, message: 'x'.repeat(20_000), annotations: []},
        ],
        coverage: null,
      },
    ])
    expect(output).toContain('… truncated 12000 characters')
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

  test('a test title cannot terminate its html block and inject markdown', () => {
    const output = renderSummary(
      [
        {
          name: '@conciv/evil',
          passed: 0,
          failed: 1,
          flaky: 0,
          skipped: 0,
          timeMs: 1,
          cases: [
            {
              title: 'benign </summary></details>\n\n## ALL TESTS PASSED\n\n<details><summary>x',
              status: 'failed',
              durationMs: 1,
              retries: 0,
              message: 'boom',
              annotations: [],
            },
          ],
          coverage: null,
        },
      ],
      {details: true},
    )
    expect(output.split('\n').some((line) => line.startsWith('## ALL TESTS PASSED'))).toBe(false)
    expect(output).not.toContain('</summary></details>')
    expect(output).toContain('&lt;/summary&gt;&lt;/details&gt; ## ALL TESTS PASSED')
  })

  test('a package suite is timed by wall clock, not by summing files that ran in parallel', () => {
    const overlapping = JSON.stringify({
      testResults: [
        {name: '/a.test.ts', status: 'passed', startTime: 1_000, endTime: 11_000, assertionResults: []},
        {name: '/b.test.ts', status: 'passed', startTime: 1_100, endTime: 11_200, assertionResults: []},
        {name: '/c.test.ts', status: 'passed', startTime: 1_200, endTime: 10_500, assertionResults: []},
      ],
    })
    const [summary] = parseReport('@conciv/parallel', overlapping)
    expect(summary?.timeMs).toBe(10_200)
  })
})
