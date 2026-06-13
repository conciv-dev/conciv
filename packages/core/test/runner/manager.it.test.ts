import {describe, it, expect, afterAll} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import type {TestRunnerManager} from '@devgent/protocol/runner-types'
import {makeVitestManager, isVitestUnavailable} from '../../src/runner/vitest/manager.js'
import {tsxSpawnRunner, errorSpawnRunner} from '../helpers.js'

// Real out-of-process IT: makeVitestManager spawns the actual vitest runner child (via tsx),
// which embeds the fixture app's real vitest, runs it, and streams events back over fd 3.

const fixture = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/vitest-app')

describe('vitest-manager against a real fixture app (IT)', () => {
  const state: {mgr: TestRunnerManager | undefined} = {mgr: undefined}
  // No non-null assertions (spec "Typing discipline"): a small accessor throws if unset.
  const requireMgr = (): TestRunnerManager => {
    if (!state.mgr) throw new Error('manager not initialized — the list test runs first')
    return state.mgr
  }
  afterAll(async () => {
    await state.mgr?.stop()
  })

  it('lists the fixture test files without running', async () => {
    const mgr = makeVitestManager(fixture, {spawnRunner: tsxSpawnRunner})
    state.mgr = mgr
    const {files} = await mgr.list()
    expect(files.map((f) => f.relPath).toSorted()).toEqual(['fail.test.ts', 'pass.test.ts'])
  })

  it('runs all tests and returns a summary with the one real failure', async () => {
    const mgr = requireMgr()
    const result = await mgr.run({})
    expect(result.summary.passed).toBe(1)
    expect(result.summary.failed).toBe(1)
    expect(result.failures).toHaveLength(1)
    const [failure] = result.failures
    expect(failure?.name).toBe('this fails on purpose')
    expect(failure?.file).toContain('fail.test.ts')
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

  it('surfaces a typed VitestUnavailableError when vitest can not init', async () => {
    const mgr = makeVitestManager(fixture, {spawnRunner: errorSpawnRunner("Cannot find module 'vitest/node'")})
    const runErr = await mgr.run({}).then(
      () => null,
      (e: unknown) => e,
    )
    expect(isVitestUnavailable(runErr)).toBe(true)
    // narrow via instanceof rather than asserting (spec "Typing discipline").
    expect(runErr instanceof Error ? runErr.message : '').toContain('vitest unavailable')
    // emitSnapshot is pure and must stay safe even when vitest can't init.
    expect(mgr.emitSnapshot()).toMatchObject({type: 'snapshot', watching: false})
  })
})
