import {describe, it, expect, afterAll} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import type {TestRunnerManager} from '../src/runner/contract.js'
import {makeChildManager, isRunnerUnavailable, type ChildRunnerSpec} from '../src/runner/driver.js'
import {vitest as vitestAdapter} from '../src/runners/vitest/adapter.js'
import {tsxSpawnFor, errorSpawnRunner} from './helpers.js'

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')
const childTs = new URL('../src/runners/vitest/child.ts', import.meta.url)

const vitestSpec = {
  id: 'vitest',
  capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: true},
  childUrl: childTs,
  buildRunArgs: (args, cwd) => {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    const failedArgs = args.failedOnly ? ['--failed'] : []
    return ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs, ...failedArgs]
  },
  buildListArgs: (failedOnly, cwd) => ['--mode', 'list', '--cwd', cwd, ...(failedOnly ? ['--failed'] : [])],
} satisfies ChildRunnerSpec

describe('vitest adapter against a real fixture app (IT)', () => {
  expect(vitestAdapter.id).toBe('vitest')

  const state: {mgr: TestRunnerManager | undefined} = {mgr: undefined}
  const requireMgr = (): TestRunnerManager => {
    if (!state.mgr) throw new Error('manager not initialized; the list test runs first')
    return state.mgr
  }
  afterAll(async () => {
    await state.mgr?.stop()
  })

  it('lists the fixture test files without running', async () => {
    const mgr = makeChildManager(vitestSpec, fixture, {spawnRunner: tsxSpawnFor(childTs)})
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

  it('surfaces a typed RunnerUnavailableError when vitest can not init', async () => {
    const mgr = makeChildManager(vitestSpec, fixture, {
      spawnRunner: errorSpawnRunner("Cannot find module 'vitest/node'"),
    })
    const runErr = await mgr.run({}).then(
      () => null,
      (e: unknown) => e,
    )
    expect(isRunnerUnavailable(runErr)).toBe(true)
    expect(runErr instanceof Error ? runErr.message : '').toContain('vitest unavailable')
    expect(mgr.emitSnapshot()).toMatchObject({type: 'snapshot', watching: false})
  })
})
