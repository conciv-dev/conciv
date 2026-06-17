import {describe, it, expect, afterAll} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import type {TestRunnerManager} from '@opendui/aidx-protocol/runner-types'
import {makeChildManager, isRunnerUnavailable, type ChildRunnerSpec} from '../src/driver.js'
import {playwright as playwrightAdapter} from '../src/playwright/playwright.js'
import {tsxSpawnFor, errorSpawnRunner} from './helpers.js'

// Real out-of-process IT: makeChildManager spawns the actual playwright child (via tsx), which
// runs the fixture's real `playwright test --reporter=json` and streams events back over fd 3.
// The fixture includes a real-browser spec (launches chromium) alongside browser-free ones.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/playwright-app')
const childTs = new URL('../src/playwright/child.ts', import.meta.url)

const playwrightSpec = {
  id: 'playwright',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
  childUrl: childTs,
  buildRunArgs: (args, cwd) => {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    return ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs]
  },
  buildListArgs: (_failedOnly, cwd) => ['--mode', 'list', '--cwd', cwd],
} satisfies ChildRunnerSpec

describe('playwright adapter against a real fixture (IT)', () => {
  expect(playwrightAdapter.id).toBe('playwright')

  const state: {mgr: TestRunnerManager | undefined} = {mgr: undefined}
  const requireMgr = (): TestRunnerManager => {
    if (!state.mgr) throw new Error('manager not initialized — the list test runs first')
    return state.mgr
  }
  afterAll(async () => {
    await state.mgr?.stop()
  })

  it('lists the fixture spec files without running', async () => {
    const mgr = makeChildManager(playwrightSpec, fixture, {spawnRunner: tsxSpawnFor(childTs)})
    state.mgr = mgr
    const {files} = await mgr.list()
    expect(files.map((f) => f.relPath).toSorted()).toEqual(['browser.spec.ts', 'fail.spec.ts', 'pass.spec.ts'])
  })

  it('runs all tests (real browser + nested describe) and returns the one real failure', async () => {
    const result = await requireMgr().run({})
    expect(result.summary.passed).toBe(3) // pass.spec ×2 (incl. nested) + the real-browser spec
    expect(result.summary.failed).toBe(1)
    expect(result.tests.map((t) => t.name).toSorted()).toEqual([
      'one plus one',
      'renders content in a real browser',
      'this fails on purpose',
      'two plus two',
    ])
    const [failure] = result.failures
    expect(failure?.name).toBe('this fails on purpose')
    expect(failure?.file).toContain('fail.spec.ts')
  })

  it('runs only the spec matching a pattern', async () => {
    const result = await requireMgr().run({patterns: ['pass']})
    expect(result.summary.passed).toBe(2)
    expect(result.summary.failed).toBe(0)
  })

  it('streams run-start / test / run-end events to a subscriber', async () => {
    const mgr = requireMgr()
    const events: string[] = []
    const unsub = mgr.subscribeRaw((e) => events.push(e.type))
    await mgr.run({patterns: ['pass']})
    unsub()
    expect(events).toContain('run-start')
    expect(events).toContain('test')
    expect(events).toContain('run-end')
  })

  it('surfaces a typed RunnerUnavailableError when the child fails to produce a report', async () => {
    const mgr = makeChildManager(playwrightSpec, fixture, {
      spawnRunner: errorSpawnRunner('playwright not found in the app'),
    })
    const runErr = await mgr.run({}).then(
      () => null,
      (e: unknown) => e,
    )
    expect(isRunnerUnavailable(runErr)).toBe(true)
  })
})
