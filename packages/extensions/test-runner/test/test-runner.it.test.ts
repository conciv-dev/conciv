import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeCallTool, makeDiscoverTools, makeRunTypescript} from '@conciv/harness-testkit'
import {serveExtensionRpc} from '@conciv/harness-testkit/rpc-mounts'
import {start, type Engine} from '@conciv/core'
import type {ConcivConfig} from '@conciv/core/config'
import {makeExtRpcClient, type AnyExtension, type RegisterExtension} from '@conciv/extension'
import testRunnerExtension, {makeTestRunnerRouter, type TestRunnerRouter} from '../src/server.js'
import type {TestRunnerManager} from '../src/runner/contract.js'
import {makeChildManager, isRunnerUnavailable, type ChildRunnerSpec} from '../src/runner/driver.js'
import {playwright as playwrightAdapter} from '../src/runners/playwright/adapter.js'
import {vitest as vitestAdapter} from '../src/runners/vitest/adapter.js'
import {
  tsxSpawnFor,
  errorSpawnRunner,
  silentExitSpawnRunner,
  killedSpawnRunner,
  captureRunError,
  vitestChildTs,
  vitestSpec,
} from './helpers.js'

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof testRunnerExtension> {}
}

describe('extension', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

  function runnerClient(base: string) {
    return makeExtRpcClient<TestRunnerRouter>(base, 'test-runner')
  }

  const extensions: AnyExtension[] = [testRunnerExtension]

  async function boot(opts: {root?: string; extensions?: ConcivConfig['extensions']} = {}): Promise<{
    base: string
    engine: Engine
  }> {
    const engine = await start({
      options: {
        systemPrompt: false,
        extensions: opts.extensions,
        stateRoot: mkdtempSync(join(tmpdir(), 'conciv-test-runner-it-')),
      },
      root: opts.root ?? fixture,
      launchEditor: () => {},
      extensions,
    })
    return {base: engine.agentBase, engine}
  }

  function callViaSandbox(base: string, name: string, input: unknown): Promise<unknown> {
    return makeCallTool(base, '')(name, input)
  }

  describe('test-runner extension booted in the real engine (IT)', () => {
    it('serves a TestRunResult shape on status under the default vitest config', async () => {
      const {base, engine} = await boot()
      try {
        const status = await runnerClient(base).status(undefined)
        expect(typeof status.summary.passed).toBe('number')
        expect(typeof status.summary.failed).toBe('number')
        expect(typeof status.summary.skipped).toBe('number')
        expect(typeof status.summary.durationMs).toBe('number')
        expect(Array.isArray(status.failures)).toBe(true)
        expect(Array.isArray(status.tests)).toBe(true)
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('reaches test_runner through the sandbox on /api/mcp and round-trips to the injected manager', async () => {
      const {base, engine} = await boot()
      try {
        const status = z
          .object({summary: z.object({passed: z.number()}).loose(), tests: z.array(z.unknown())})
          .loose()
          .parse(await callViaSandbox(base, 'test_runner', {action: 'status'}))
        expect(typeof status.summary.passed).toBe('number')
        expect(Array.isArray(status.tests)).toBe(true)
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('emits a snapshot event on stream open', async () => {
      const {base, engine} = await boot()
      try {
        const abort = new AbortController()
        const stream = await runnerClient(base).stream(undefined, {signal: abort.signal})
        const first = await stream.next()
        if (first.done) throw new Error('stream ended before the snapshot')
        expect(first.value.type).toBe('snapshot')
        abort.abort()
        await stream.return(undefined).catch(() => {})
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('skips a misconfigured runner (runner=jest stub) without aborting boot', async () => {
      const {base, engine} = await boot({extensions: {'test-runner': {runner: 'jest'}}})
      try {
        await expect(runnerClient(base).status(undefined)).rejects.toThrow()
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('rejects a non-loopback Origin on an extension rpc route with 403', async () => {
      const {base, engine} = await boot()
      try {
        const forbidden = await fetch(`${base}/rpc/ext/test-runner/status`, {
          method: 'POST',
          headers: {origin: 'http://evil.com', 'content-type': 'application/json'},
          body: '{}',
        })
        expect(forbidden.status).toBe(403)
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('maps a runner-unavailable failure to a typed UNAVAILABLE error on run', async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-it-state-'))
      const missingRoot = join(mkdtempSync(join(tmpdir(), 'conciv-it-root-')), 'absent')
      const engine = await start({
        options: {systemPrompt: false, stateRoot},
        root: missingRoot,
        launchEditor: () => {},
        extensions,
      })
      const base = engine.agentBase
      try {
        await expect(runnerClient(base).run({})).rejects.toMatchObject({
          code: 'UNAVAILABLE',
          data: {available: false},
        })
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('runs the extension disposer (manager.stop) when the engine stops', async () => {
      const {base, engine} = await boot()
      await expect(engine.stop()).resolves.toBeUndefined()
      await expect(runnerClient(base).status(undefined)).rejects.toThrow()
    }, 30_000)
  })
})

describe('playwright', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/playwright-app')
  const childTs = new URL('../src/runners/playwright/child.ts', import.meta.url)

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
      if (!state.mgr) throw new Error('manager not initialized; the list test runs first')
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
      expect(result.summary.passed).toBe(3)
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
      const runErr = await captureRunError(mgr)
      expect(isRunnerUnavailable(runErr)).toBe(true)
    })

    it('names the exit code when the child dies silently with no output', async () => {
      const mgr = makeChildManager(playwrightSpec, fixture, {spawnRunner: silentExitSpawnRunner(7)})
      const runErr = await captureRunError(mgr)
      expect(isRunnerUnavailable(runErr)).toBe(true)
      expect(runErr).toBeInstanceOf(Error)
      expect((runErr as Error).message).toContain('exit code 7')
      expect((runErr as Error).message).toContain('signal null')
    })

    it('names the signal when the child is killed with no output', async () => {
      const mgr = makeChildManager(playwrightSpec, fixture, {spawnRunner: killedSpawnRunner('SIGKILL')})
      const runErr = await captureRunError(mgr)
      expect(isRunnerUnavailable(runErr)).toBe(true)
      expect(runErr).toBeInstanceOf(Error)
      expect((runErr as Error).message).toContain('signal SIGKILL')
    })
  })
})

describe('streaming', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

  describe('the test-runner rpc stream over a real vitest run (IT)', () => {
    it('delivers per-test events while the run is still in flight', async () => {
      const manager = makeChildManager(vitestSpec, fixture, {spawnRunner: tsxSpawnFor(vitestChildTs)})
      const served = await serveExtensionRpc({slug: 'test-runner', router: makeTestRunnerRouter(manager)})
      const abort = new AbortController()
      try {
        const client = makeExtRpcClient<TestRunnerRouter>(served.base, 'test-runner')
        const stream = await client.stream(undefined, {signal: abort.signal})
        const progress = {runResolved: false, testsWhileRunning: 0}
        const sharedTitleIds: string[] = []
        const collecting = (async () => {
          for await (const event of stream) {
            if (event.type === 'test' && !progress.runResolved) progress.testsWhileRunning += 1
            if (event.type === 'test' && event.name === 'shares a title') sharedTitleIds.push(event.id)
            if (event.type === 'run-end') return
          }
        })()
        await client.run({}).finally(() => {
          progress.runResolved = true
        })
        await collecting
        expect(progress.testsWhileRunning).toBeGreaterThan(0)
        expect(sharedTitleIds).toHaveLength(2)
        expect(new Set(sharedTitleIds).size).toBe(2)
      } finally {
        abort.abort()
        await manager.stop()
        await served.close()
      }
    }, 60_000)
  })
})

describe('tool catalog', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

  const extensions: AnyExtension[] = [testRunnerExtension]

  async function boot(): Promise<{base: string; engine: Engine}> {
    const engine = await start({
      options: {systemPrompt: false, stateRoot: mkdtempSync(join(tmpdir(), 'conciv-test-runner-catalog-'))},
      root: fixture,
      launchEditor: () => {},
      extensions,
    })
    return {base: engine.agentBase, engine}
  }

  function runSandbox(base: string, typescriptCode: string): Promise<unknown> {
    return makeRunTypescript(base, '')(typescriptCode)
  }

  describe('the test-runner tool rides the tool registry into the sandbox (IT)', () => {
    it('appears in discover_tools with its declared summary', async () => {
      const {base, engine} = await boot()
      try {
        const {tools} = await makeDiscoverTools(base, '')(['test_runner'])
        expect(tools.map((tool) => tool.name)).toEqual(['external_test_runner'])
        expect(tools[0]?.description).not.toBe('')
      } finally {
        await engine.stop()
      }
    }, 60_000)

    it('is callable through code-mode and round-trips a status result from the real manager', async () => {
      const {base, engine} = await boot()
      try {
        const status = z
          .object({summary: z.object({passed: z.number()}).loose(), tests: z.array(z.unknown())})
          .loose()
          .parse(await runSandbox(base, "return await external_test_runner({action: 'status'})"))
        expect(Array.isArray(status.tests)).toBe(true)
      } finally {
        await engine.stop()
      }
    }, 60_000)
  })
})

describe('vitest', () => {
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

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
      const mgr = makeChildManager(vitestSpec, fixture, {spawnRunner: tsxSpawnFor(vitestChildTs)})
      state.mgr = mgr
      const {files} = await mgr.list()
      expect(files.map((f) => f.relPath).toSorted()).toEqual(['fail.test.ts', 'pass.test.ts'])
    })

    it('runs all tests and returns a summary with the one real failure', async () => {
      const mgr = requireMgr()
      const result = await mgr.run({})
      expect(result.summary.passed).toBe(3)
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
      const runErr = await captureRunError(mgr)
      expect(isRunnerUnavailable(runErr)).toBe(true)
      expect(runErr instanceof Error ? runErr.message : '').toContain('vitest unavailable')
      expect(mgr.emitSnapshot()).toMatchObject({type: 'snapshot', watching: false})
    })
  })
})
