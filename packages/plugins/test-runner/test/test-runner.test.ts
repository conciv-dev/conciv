import {readdirSync, readFileSync, symlinkSync} from 'node:fs'
import {readdir, readFile, watch} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it, onTestFinished, vi} from 'vitest'
import {z} from 'zod'
import {connectMcpClient, makeDiscoverTools} from '@conciv/harness-testkit'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {Effect, Exit, Fiber, Layer, Logger, Ref, Scope, Sink, Stream} from 'effect'
import * as PlatformError from 'effect/PlatformError'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import {TestRunnerFollowMachine} from '../src/follow-machine.js'
import {TestRunnerRunMachine} from '../src/run-machine.js'
import {VitestAdapter} from '../src/vitest.js'
import type {TestEvent, TestRow} from '../src/events.js'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const STARTED = 'blocked-test-started'

const SummarySchema = z.object({passed: z.number(), failed: z.number(), skipped: z.number(), durationMs: z.number()})
const TestErrorSchema = z.object({
  file: z.string(),
  name: z.string(),
  message: z.string(),
  stack: z.string(),
  line: z.number().optional(),
})
const TestRowSchema = z.object({
  id: z.string(),
  file: z.string(),
  name: z.string(),
  state: z.enum(['pass', 'fail', 'skip']),
  durationMs: z.number(),
  error: TestErrorSchema.optional(),
})
const RunResultSchema = z.strictObject({
  summary: SummarySchema,
  failures: z.array(TestErrorSchema),
  tests: z.array(TestRowSchema),
})
const ListSchema = z.strictObject({
  files: z.array(z.object({file: z.string(), relPath: z.string()})),
})
const LiveEventSchema = z.object({type: z.string(), id: z.string().optional(), name: z.string().optional()})
const UnavailableSchema = z.object({
  code: z.literal('PLUGIN_RPC'),
  data: z.object({
    type: z.literal('UNAVAILABLE'),
    data: z.object({available: z.literal(false), error: z.string()}),
  }),
})

const BLOCKED_VITEST_TEST = `import {renameSync, writeFileSync} from 'node:fs'
import {test} from 'vitest'

const startedFile = process.env['CONCIV_FIXTURE_BLOCKED_FILE']

test('blocks until the run is stopped', async () => {
  if (startedFile === undefined) return
  writeFileSync(\`\${startedFile}.partial\`, String(process.ppid))
  renameSync(\`\${startedFile}.partial\`, startedFile)
  await new Promise(() => {})
}, 600_000)
`

function fixtureFiles(name: string): Record<string, string> {
  const directory = join(PACKAGE_DIR, 'test', 'fixtures', name)
  return Object.fromEntries(readdirSync(directory).map((file) => [file, readFileSync(join(directory, file), 'utf8')]))
}

function installDependencies(kit: CoreKit): void {
  symlinkSync(join(PACKAGE_DIR, 'node_modules'), join(kit.stateRoot, 'node_modules'), 'dir')
}

async function bootProject(
  files: Record<string, string>,
  options?: Record<string, string>,
): Promise<{kit: CoreKit; stop: () => Promise<void>}> {
  const kit = await bootCoreKit({
    id: 'fake',
    plugins: [options === undefined ? PACKAGE_DIR : [PACKAGE_DIR, options]],
    files,
  })
  const stopping: {promise?: Promise<void>} = {}
  const stop = () => (stopping.promise ??= kit.cleanup())
  onTestFinished(stop)
  return {kit, stop}
}

function call(kit: CoreKit, method: string, input: unknown = {}): Promise<unknown> {
  return kit.rpc.plugin.call({rpcId: 'test-runner', method, input}, {signal: AbortSignal.timeout(90_000)})
}

async function unavailableError(pending: Promise<unknown>): Promise<string> {
  const failure = await pending.then(
    () => new Error('the call answered instead of failing'),
    (error: unknown) => error,
  )
  return UnavailableSchema.parse(failure).data.data.error
}

async function useTool(
  kit: CoreKit,
  name: 'list' | 'run' | 'status',
  input: {pattern?: string} = {},
): Promise<unknown> {
  if (name === 'list') return kit.callTool('test_runner_list', input)
  const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === `test_runner_${name}`)
    if (!tool) throw new Error(`test_runner_${name} is not a direct tool on /api/mcp`)
    return JSON.parse(z.string().parse(await tool.execute(input)))
  } finally {
    await mcp.close()
  }
}

async function directToolNames(kit: CoreKit): Promise<string[]> {
  const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
  try {
    return (await mcp.tools()).map((tool) => tool.name)
  } finally {
    await mcp.close()
  }
}

async function fileAppears(directory: string, name: string, signal: AbortSignal): Promise<void> {
  for await (const change of watch(directory, {signal})) if (change.filename === name) return
}

async function blockedRun(
  scratch: string,
  start: () => Promise<unknown>,
): Promise<{pid: number; settled: Promise<unknown>}> {
  const watching = new AbortController()
  const appeared = fileAppears(scratch, STARTED, watching.signal)
  const settled = start().then(
    (result) => result,
    (error: unknown) => error,
  )
  await appeared
  watching.abort()
  return {pid: Number(await readFile(join(scratch, STARTED), 'utf8')), settled}
}

function processGone(pid: number): void {
  expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({code: 'ESRCH'}))
}

async function withChildEnvironment<Value>(
  variables: Record<string, string>,
  work: () => Promise<Value>,
): Promise<Value> {
  const previous = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]))
  Object.assign(process.env, variables)
  try {
    return await work()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function followRun(kit: CoreKit, start: () => Promise<unknown>) {
  const following = new AbortController()
  const stream = await kit.rpc.event.subscribe({types: ['rpc.test-runner.event']}, {signal: following.signal})
  const progress = {
    runResolved: false,
    testsWhileRunning: 0,
    types: new Array<string>(),
    sharedTitleIds: new Array<string>(),
  }
  const collect = async () => {
    for await (const delivered of stream) {
      if (delivered.type === 'server.connected' || delivered.type === 'server.heartbeat') continue
      expect(delivered.type).toBe('rpc.test-runner.event')
      const event = LiveEventSchema.parse(delivered.data)
      progress.types.push(event.type)
      if (event.type === 'test' && !progress.runResolved) progress.testsWhileRunning += 1
      if (event.type === 'test' && event.name === 'shares a title' && event.id) progress.sharedTitleIds.push(event.id)
      if (event.type === 'run-end') return
    }
  }
  const collected = collect()
  const result = await start().finally(() => {
    progress.runResolved = true
  })
  await collected
  following.abort()
  return {result, progress}
}

describe('the test-runner plugin on a vitest project', () => {
  it('is active, lists for code mode, offers run and status as direct tools, lists, runs, streams a run live, reports status and stops a run on rpc stop and on engine stop', async () => {
    const {kit, stop} = await bootProject({...fixtureFiles('vitest-app'), 'blocked.test.ts': BLOCKED_VITEST_TEST})
    installDependencies(kit)

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'test-runner')
    expect(plugin?.state).toEqual({status: 'active'})
    expect(plugin?.features).toMatchObject({server: true, rpc: true})

    expect(RunResultSchema.parse(await call(kit, 'status'))).toEqual({
      summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
      failures: [],
      tests: [],
    })

    const discovered = await makeDiscoverTools(
      kit.base,
      await kit.session(),
    )(['test_runner_list', 'test_runner_run', 'test_runner_status'])
    expect(discovered.tools.map((tool) => tool.name)).toEqual(['external_test_runner_list'])

    const direct = await directToolNames(kit)
    expect(direct).toEqual(expect.arrayContaining(['execute_typescript', 'test_runner_run', 'test_runner_status']))
    expect(direct).not.toContain('test_runner_list')

    const listed = ListSchema.parse(await useTool(kit, 'list'))
    expect(listed.files.map((file) => file.relPath).toSorted()).toEqual([
      'blocked.test.ts',
      'fail.test.ts',
      'pass.test.ts',
    ])

    const {result, progress} = await followRun(kit, () => call(kit, 'run', {}))
    const all = RunResultSchema.parse(result)
    expect(all.summary).toMatchObject({passed: 4, failed: 1})
    expect(all.failures.map((failure) => failure.name)).toEqual(['this fails on purpose'])
    expect(all.failures[0]?.file).toContain('fail.test.ts')
    expect(progress.types[0]).toBe('run-start')
    expect(progress.types.filter((type) => type === 'test')).toHaveLength(all.tests.length)
    expect(progress.types.filter((type) => type === 'file-end')).toHaveLength(listed.files.length)
    expect(progress.types.at(-1)).toBe('run-end')
    expect(progress.testsWhileRunning).toBeGreaterThan(0)
    expect(new Set(progress.sharedTitleIds).size).toBe(2)

    const pattern = RunResultSchema.parse(await useTool(kit, 'run', {pattern: 'pass'}))
    expect(pattern.summary).toMatchObject({passed: 3, failed: 0})
    expect(pattern.tests.map((test) => test.name).toSorted()).toEqual([
      'one plus one',
      'shares a title',
      'shares a title',
    ])

    expect(RunResultSchema.parse(await useTool(kit, 'status'))).toEqual(pattern)

    const rpcScratch = tempDir('conciv-test-runner-rpc-stop-')
    await withChildEnvironment({CONCIV_FIXTURE_BLOCKED_FILE: join(rpcScratch, STARTED)}, async () => {
      const stoppedByRpc = await blockedRun(rpcScratch, () => call(kit, 'run', {patterns: ['blocked']}))
      expect(await call(kit, 'stop')).toEqual({ok: true})
      await stoppedByRpc.settled
      processGone(stoppedByRpc.pid)
    })

    const engineScratch = tempDir('conciv-test-runner-engine-stop-')
    await withChildEnvironment({CONCIV_FIXTURE_BLOCKED_FILE: join(engineScratch, STARTED)}, async () => {
      const stoppedWithEngine = await blockedRun(engineScratch, () => call(kit, 'run', {patterns: ['blocked']}))
      await stop()
      await vi.waitFor(() => processGone(stoppedWithEngine.pid), {timeout: 10_000})
      await stoppedWithEngine.settled
    })
  })
})

describe('the test-runner plugin when the runner cannot start', () => {
  it('answers UNAVAILABLE when vitest is missing, and names the exit code or the signal when the child dies silently', async () => {
    const {kit} = await bootProject(fixtureFiles('vitest-app'))

    expect(await unavailableError(call(kit, 'run', {}))).toContain('vitest unavailable')
    expect(await unavailableError(call(kit, 'list', {}))).toContain('vitest unavailable')

    installDependencies(kit)
    kit.writeProjectFile('vitest.config.ts', 'process.exit(7)\n')
    const exited = await unavailableError(call(kit, 'run', {}))
    expect(exited).toContain('exit code 7')
    expect(exited).toContain('signal null')

    kit.writeProjectFile('vitest.config.ts', "process.kill(process.pid, 'SIGKILL')\n")
    expect(await unavailableError(call(kit, 'run', {}))).toContain('signal SIGKILL')
  })
})

describe('the test-runner plugin on a playwright project', () => {
  it('answers UNAVAILABLE without playwright, lists, runs, runs a pattern, and removes its report when stopped mid-test', async () => {
    const {kit} = await bootProject(fixtureFiles('playwright-app'), {runner: 'playwright'})

    expect(await unavailableError(call(kit, 'run', {}))).toContain('playwright unavailable')

    installDependencies(kit)
    const listed = ListSchema.parse(await useTool(kit, 'list'))
    expect(listed.files.map((file) => file.relPath).toSorted()).toEqual([
      'blocked.spec.ts',
      'browser.spec.ts',
      'fail.spec.ts',
      'pass.spec.ts',
    ])

    const {result, progress} = await followRun(kit, () => call(kit, 'run', {}))
    const all = RunResultSchema.parse(result)
    expect(all.summary).toMatchObject({passed: 4, failed: 1})
    expect(all.tests.map((test) => test.name).toSorted()).toEqual([
      'blocks until the run is stopped',
      'one plus one',
      'renders content in a real browser',
      'this fails on purpose',
      'two plus two',
    ])
    expect(all.failures.map((failure) => failure.name)).toEqual(['this fails on purpose'])
    expect(all.failures[0]?.file).toContain('fail.spec.ts')
    expect(progress.types).toEqual(expect.arrayContaining(['run-start', 'test', 'run-end']))

    const pattern = RunResultSchema.parse(await useTool(kit, 'run', {pattern: 'pass'}))
    expect(pattern.summary).toMatchObject({passed: 2, failed: 0})

    const scratch = tempDir('conciv-playwright-stop-')
    await withChildEnvironment({TMPDIR: scratch, CONCIV_FIXTURE_BLOCKED_FILE: join(scratch, STARTED)}, async () => {
      const blocked = await blockedRun(scratch, () => call(kit, 'run', {patterns: ['blocked']}))
      expect(await call(kit, 'stop')).toEqual({ok: true})
      await blocked.settled
      expect((await readdir(scratch)).filter((name) => name.startsWith('conciv-playwright-report-'))).toEqual([])
      processGone(blocked.pid)
    })
  })
})

describe('the test-runner plugin with a runner that is not implemented', () => {
  it('fails only this plugin and leaves the engine up', async () => {
    const {kit} = await bootProject({}, {runner: 'jest'})
    const listed = await kit.rpc.plugin.list()
    expect(listed.data.find((entry) => entry.id === 'test-runner')?.state).toEqual({
      status: 'failed',
      error: expect.stringContaining('jest runner not implemented'),
    })
    await expect(call(kit, 'status')).rejects.toMatchObject({data: {type: 'rpc.unavailable'}})
    expect(listed.data.some((entry) => entry.state.status === 'active')).toBe(true)
  })
})

function replayRun(runner: string, ...events: TestRunnerRunMachine.RunEvent[]) {
  return events.reduce(
    (result, event) => {
      const next = TestRunnerRunMachine.transitionRun(result.state, event)
      return {state: next.state, effects: [...result.effects, ...next.effects]}
    },
    {state: TestRunnerRunMachine.createRunState(runner), effects: new Array<TestRunnerRunMachine.RunEffect>()},
  )
}

const RUN_START: TestEvent = {type: 'run-start', runId: 'r1', files: ['/app/pass.test.ts']}
const PASSED_ROW: TestRow = {id: 'p1', file: '/app/pass.test.ts', name: 'one plus one', state: 'pass', durationMs: 2}
const PASSED: TestEvent = {type: 'test', ...PASSED_ROW}
const SUMMARY = {passed: 1, failed: 0, skipped: 0, durationMs: 2}
const RUN_END: TestEvent = {
  type: 'run-end',
  runId: 'r1',
  summary: SUMMARY,
  failures: [],
  tests: [PASSED_ROW],
}

describe('the run machine of the test-runner driver', () => {
  it('runs a child to its run-end, publishing each event and settling with the finished run', () => {
    const {state, effects} = replayRun(
      'vitest',
      {type: 'run-requested', attempt: 1, args: ['--mode', 'run']},
      {type: 'child-event', attempt: 1, message: RUN_START},
      {type: 'child-event', attempt: 1, message: PASSED},
    )
    expect(state).toMatchObject({status: 'running', attempt: 1, buffer: [RUN_START, PASSED]})
    expect(TestRunnerRunMachine.selectCurrentRun(state)).toEqual({events: [RUN_START, PASSED], unavailable: null})
    expect(effects).toEqual([
      {type: 'spawn', attempt: 1, args: ['--mode', 'run']},
      {type: 'publish', event: RUN_START},
      {type: 'publish', event: PASSED},
    ])
    const ended = replayRun(
      'vitest',
      {type: 'run-requested', attempt: 1, args: []},
      {type: 'child-event', attempt: 1, message: RUN_END},
      {type: 'child-exited', attempt: 1, exit: {type: 'exited', code: 0, signal: null}},
    )
    expect(ended.state.status).toBe('idle')
    expect(TestRunnerRunMachine.selectCurrentRun(ended.state)).toEqual({events: null, unavailable: null})
    expect(ended.effects.at(-1)).toEqual({
      type: 'settle',
      attempt: 1,
      settlement: {ok: true, result: {summary: SUMMARY, failures: [], tests: [PASSED_ROW]}, files: []},
    })
  })

  it('names the reason a run could not start, from the child error or from a silent exit, until the next run-start', () => {
    const reported = replayRun(
      'vitest',
      {type: 'run-requested', attempt: 1, args: []},
      {type: 'child-event', attempt: 1, message: {type: 'error', reason: 'vitest/node is missing'}},
      {type: 'child-exited', attempt: 1, exit: {type: 'exited', code: 1, signal: null}},
    )
    const message = 'vitest unavailable: vitest/node is missing'
    expect(reported.state).toMatchObject({status: 'idle', unavailable: message})
    expect(reported.effects.slice(1)).toEqual([
      {type: 'publish', event: {type: 'run-unavailable', reason: message}},
      {type: 'settle', attempt: 1, settlement: {ok: false, message}},
    ])
    const killed = replayRun(
      'vitest',
      {type: 'run-requested', attempt: 1, args: []},
      {type: 'child-exited', attempt: 1, exit: {type: 'exited', code: null, signal: 'SIGKILL'}},
    )
    expect(killed.state.unavailable).toBe(
      'vitest unavailable: child exited without producing results (exit code null, signal SIGKILL)',
    )
    const cleared = TestRunnerRunMachine.transitionRun(
      TestRunnerRunMachine.transitionRun(killed.state, {type: 'run-requested', attempt: 2, args: []}).state,
      {type: 'child-event', attempt: 2, message: RUN_START},
    )
    expect(cleared.state.unavailable).toBeNull()
  })

  it('lists files, ignores stale attempts, refuses a second request while busy and stops the running child', () => {
    const files = [{file: '/app/pass.test.ts', relPath: 'pass.test.ts'}]
    const listed = replayRun(
      'vitest',
      {type: 'list-requested', attempt: 1, args: ['--mode', 'list']},
      {type: 'child-event', attempt: 1, message: {type: 'list', files}},
      {type: 'child-exited', attempt: 1, exit: {type: 'exited', code: 0, signal: null}},
    )
    expect(listed.effects.at(-1)).toMatchObject({type: 'settle', attempt: 1, settlement: {ok: true, files}})

    const running = replayRun('vitest', {type: 'run-requested', attempt: 1, args: []})
    const stale = TestRunnerRunMachine.transitionRun(running.state, {
      type: 'child-event',
      attempt: 7,
      message: RUN_START,
    })
    expect(stale.state).toBe(running.state)
    expect(TestRunnerRunMachine.transitionRun(running.state, {type: 'run-requested', attempt: 9, args: []}).state).toBe(
      running.state,
    )
    const refused = TestRunnerRunMachine.transitionRun(running.state, {type: 'list-requested', attempt: 2, args: []})
    expect(refused.effects).toEqual([
      {
        type: 'settle',
        attempt: 2,
        settlement: {ok: false, message: 'vitest unavailable: a test run is already in progress'},
      },
    ])

    const stopping = TestRunnerRunMachine.transitionRun(running.state, {type: 'stop-requested'})
    expect(stopping.state).toMatchObject({status: 'stopping', attempt: 1})
    expect(stopping.effects).toEqual([{type: 'kill', attempt: 1}])
    const late = TestRunnerRunMachine.transitionRun(stopping.state, {
      type: 'child-event',
      attempt: 1,
      message: RUN_START,
    })
    expect(late.state).toBe(stopping.state)
    const stopped = TestRunnerRunMachine.transitionRun(stopping.state, {
      type: 'child-exited',
      attempt: 1,
      exit: {type: 'stopped'},
    })
    expect(stopped.state.status).toBe('idle')
    expect(stopped.effects).toMatchObject([{type: 'settle', attempt: 1, settlement: {ok: true}}])
    expect(TestRunnerRunMachine.transitionRun(stopped.state, {type: 'stop-requested'}).state).toBe(stopped.state)
  })

  it('on dispose kills the running child, settles its caller and refuses every later request', () => {
    const running = replayRun('vitest', {type: 'run-requested', attempt: 1, args: []})
    const disposed = TestRunnerRunMachine.transitionRun(running.state, {type: 'disposed'})
    const message = 'vitest unavailable: the test runner stopped'
    expect(disposed.state.status).toBe('disposed')
    expect(disposed.effects).toEqual([
      {type: 'kill', attempt: 1},
      {type: 'settle', attempt: 1, settlement: {ok: false, message}},
    ])
    expect(TestRunnerRunMachine.transitionRun(disposed.state, {type: 'disposed'}).state).toBe(disposed.state)
    expect(
      TestRunnerRunMachine.transitionRun(disposed.state, {type: 'child-exited', attempt: 1, exit: {type: 'stopped'}})
        .state,
    ).toBe(disposed.state)
    expect(
      TestRunnerRunMachine.transitionRun(disposed.state, {type: 'run-requested', attempt: 2, args: []}).effects,
    ).toEqual([{type: 'settle', attempt: 2, settlement: {ok: false, message}}])
  })
})

describe('the follow machine of the Tests panel', () => {
  const status = {summary: {passed: 1, failed: 0, skipped: 0, durationMs: 2}, failures: [], tests: [PASSED_ROW]}

  it('reads the run on each connect, applies only the newest read, forwards live events and stops when disposed', () => {
    const connected = TestRunnerFollowMachine.transitionFollow(TestRunnerFollowMachine.createFollowState(), {
      type: 'server-connected',
    })
    expect(connected.effects).toEqual([
      {type: 'apply', action: {type: 'connected'}},
      {type: 'read', attempt: 1},
    ])
    const reconnected = TestRunnerFollowMachine.transitionFollow(connected.state, {type: 'server-connected'})
    expect(reconnected.effects).toContainEqual({type: 'read', attempt: 2})
    const staleRead = TestRunnerFollowMachine.transitionFollow(reconnected.state, {
      type: 'read-done',
      attempt: 1,
      status,
      current: {events: null, unavailable: null},
    })
    expect(staleRead.state).toBe(reconnected.state)
    expect(staleRead.effects).toEqual([])
    const read = TestRunnerFollowMachine.transitionFollow(reconnected.state, {
      type: 'read-done',
      attempt: 2,
      status,
      current: {events: [RUN_START], unavailable: null},
    })
    expect(read.state).toMatchObject({status: 'connected', attempt: 2})
    expect(read.effects).toEqual([
      {type: 'apply', action: {type: 'status', result: status}},
      {type: 'apply', action: {type: 'current', events: [RUN_START], unavailable: null}},
    ])
    expect(TestRunnerFollowMachine.transitionFollow(read.state, {type: 'event', event: PASSED}).effects).toEqual([
      {type: 'apply', action: PASSED},
    ])
    const failed = TestRunnerFollowMachine.transitionFollow(
      TestRunnerFollowMachine.transitionFollow(read.state, {type: 'server-connected'}).state,
      {type: 'read-failed', attempt: 3, error: 'offline'},
    )
    expect(failed.effects).toEqual([
      {type: 'log', message: '[test-runner] the test run could not be read', error: 'offline'},
    ])
    const disposed = TestRunnerFollowMachine.transitionFollow(failed.state, {type: 'disposed'})
    expect(TestRunnerFollowMachine.transitionFollow(disposed.state, {type: 'event', event: PASSED}).effects).toEqual([])
    expect(
      TestRunnerFollowMachine.transitionFollow(disposed.state, {type: 'stream-failed', error: 'aborted'}).state,
    ).toBe(disposed.state)
  })
})

type FakeChild = {readonly lines: readonly string[]; readonly exit: number | 'SIGKILL' | 'hang'}

function fakeSpawner(children: Ref.Ref<readonly FakeChild[]>, launched: Ref.Ref<readonly string[][]>) {
  const handle = (child: FakeChild, commandLine: string) =>
    ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(1),
      exitCode:
        child.exit === 'hang'
          ? Effect.never
          : child.exit === 'SIGKILL'
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: 'Unknown',
                  module: 'ChildProcess',
                  method: 'exitCode',
                  pathOrDescriptor: commandLine,
                  cause: new Error("Process interrupted due to receipt of signal: 'SIGKILL'"),
                }),
              )
            : Effect.succeed(ChildProcessSpawner.ExitCode(child.exit)),
      isRunning: Effect.succeed(child.exit === 'hang'),
      kill: () => Effect.void,
      stdin: Sink.drain,
      stdout: Stream.empty,
      stderr: Stream.empty,
      all: Stream.empty,
      getInputFd: () => Sink.drain,
      getOutputFd: (fd) =>
        fd === 3
          ? Stream.make(child.lines.map((line) => `${line}\n`).join('')).pipe(
              Stream.encodeText,
              Stream.concat(child.exit === 'hang' ? Stream.never : Stream.empty),
            )
          : Stream.empty,
      unref: Effect.succeed(Effect.void),
    })
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        if (!ChildProcess.isStandardCommand(command)) return yield* Effect.die('the driver spawns one command')
        yield* Ref.update(launched, (all) => [...all, command.args.map(String)])
        const next = yield* Ref.modify(children, ([first, ...rest]) => [first, rest])
        if (next === undefined) return yield* Effect.die('no fake child left')
        return handle(next, [command.command, ...command.args.map(String)].join(' '))
      }),
    ),
  )
}

describe('the test-runner driver over a fake child process', () => {
  it('runs, streams, warns on a line that is not a child message, reports a failed start and a signal, lists, stops a hanging run and settles callers on dispose', async () => {
    const logged: {readonly level: string; readonly message: unknown}[] = []
    const capture = Logger.layer([Logger.make(({logLevel, message}) => logged.push({level: logLevel, message}))])
    const program = Effect.gen(function* () {
      const children = yield* Ref.make<readonly FakeChild[]>([
        {lines: [JSON.stringify(RUN_START), 'not json', JSON.stringify(PASSED), JSON.stringify(RUN_END)], exit: 0},
        {lines: [JSON.stringify({type: 'error', reason: 'vitest/node is missing'})], exit: 1},
        {lines: [], exit: 'SIGKILL'},
        {
          lines: [JSON.stringify({type: 'list', files: [{file: '/app/pass.test.ts', relPath: 'pass.test.ts'}]})],
          exit: 0,
        },
        {lines: [JSON.stringify(RUN_START)], exit: 'hang'},
        {lines: [JSON.stringify(RUN_START)], exit: 'hang'},
      ])
      const launched = yield* Ref.make<readonly string[][]>([])
      const layer = fakeSpawner(children, launched)
      const scope = yield* Scope.make()
      const manager = yield* VitestAdapter.vitest.create('/app').pipe(Scope.provide(scope), Effect.provide(layer))

      const seen = yield* manager.events.pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
      const result = yield* manager.run({patterns: ['pass']})
      expect(result).toEqual({summary: SUMMARY, failures: [], tests: [PASSED_ROW]})
      expect(yield* Fiber.join(seen)).toEqual([RUN_START, PASSED, RUN_END])
      expect(yield* manager.status).toEqual(result)
      expect(logged).toContainEqual({
        level: 'Warn',
        message: ['the test runner child sent a line that is not a child message'],
      })
      expect((yield* Ref.get(launched))[0]).toEqual(expect.arrayContaining(['--mode', 'run', '--pattern', 'pass']))

      const failed = yield* manager.run({}).pipe(Effect.flip)
      expect(failed.message).toBe('vitest unavailable: vitest/node is missing')
      expect((yield* manager.current).unavailable).toBe(failed.message)
      const killed = yield* manager.run({}).pipe(Effect.flip)
      expect(killed.message).toContain('exit code null, signal SIGKILL')

      expect(yield* manager.list(false)).toEqual({files: [{file: '/app/pass.test.ts', relPath: 'pass.test.ts'}]})

      const started = yield* manager.events.pipe(Stream.runHead, Effect.forkChild)
      const hanging = yield* manager.run({}).pipe(Effect.forkChild)
      yield* Fiber.join(started)
      expect((yield* manager.current).events).toEqual([RUN_START])
      yield* manager.stop
      expect(yield* Fiber.join(hanging)).toEqual(result)
      expect((yield* manager.current).events).toBeNull()

      const resumed = yield* manager.events.pipe(Stream.runHead, Effect.forkChild)
      const disposing = yield* manager.run({}).pipe(Effect.flip, Effect.forkChild)
      yield* Fiber.join(resumed)
      yield* Scope.close(scope, Exit.void)
      expect((yield* Fiber.join(disposing)).message).toBe('vitest unavailable: the test runner stopped')
    })
    await Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(capture)))
  })
})
