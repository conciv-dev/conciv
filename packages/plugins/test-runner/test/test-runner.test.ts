import {readdirSync, readFileSync, symlinkSync} from 'node:fs'
import {mkdtemp, readdir, readFile, rm, watch} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it, onTestFinished, vi} from 'vitest'
import {z} from 'zod'
import {makeDiscoverTools} from '@conciv/harness-testkit'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'

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
  files: z.array(z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})),
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

function useTool(kit: CoreKit, input: {action: 'list' | 'run' | 'status'; pattern?: string}): Promise<unknown> {
  return kit.callTool('test_runner_test_runner', input)
}

async function scratchDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  onTestFinished(() => rm(directory, {recursive: true, force: true}))
  return directory
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
  const stream = await kit.rpc.plugin.events({rpcId: 'test-runner', types: ['event']}, {signal: following.signal})
  const progress = {
    runResolved: false,
    testsWhileRunning: 0,
    types: new Array<string>(),
    sharedTitleIds: new Array<string>(),
  }
  const collect = async () => {
    for await (const delivered of stream) {
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
  it('is active, lists for code mode, lists, runs, streams a run live, reports status and stops a run on rpc stop and on engine stop', async () => {
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

    const discovered = await makeDiscoverTools(kit.base, await kit.session())(['test_runner_test_runner'])
    expect(discovered.tools.map((tool) => tool.name)).toEqual(['external_test_runner_test_runner'])

    const listed = ListSchema.parse(await useTool(kit, {action: 'list'}))
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
    expect(progress.types).toContain('run-start')
    expect(progress.types.at(-1)).toBe('run-end')
    expect(progress.testsWhileRunning).toBeGreaterThan(0)
    expect(new Set(progress.sharedTitleIds).size).toBe(2)

    const pattern = RunResultSchema.parse(await useTool(kit, {action: 'run', pattern: 'pass'}))
    expect(pattern.summary).toMatchObject({passed: 3, failed: 0})
    expect(pattern.tests.map((test) => test.name).toSorted()).toEqual([
      'one plus one',
      'shares a title',
      'shares a title',
    ])

    expect(RunResultSchema.parse(await useTool(kit, {action: 'status'}))).toEqual(pattern)

    const rpcScratch = await scratchDirectory('conciv-test-runner-rpc-stop-')
    await withChildEnvironment({CONCIV_FIXTURE_BLOCKED_FILE: join(rpcScratch, STARTED)}, async () => {
      const stoppedByRpc = await blockedRun(rpcScratch, () => call(kit, 'run', {patterns: ['blocked']}))
      expect(await call(kit, 'stop')).toEqual({ok: true})
      await stoppedByRpc.settled
      processGone(stoppedByRpc.pid)
    })

    const engineScratch = await scratchDirectory('conciv-test-runner-engine-stop-')
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
    const listed = ListSchema.parse(await useTool(kit, {action: 'list'}))
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

    const pattern = RunResultSchema.parse(await useTool(kit, {action: 'run', pattern: 'pass'}))
    expect(pattern.summary).toMatchObject({passed: 2, failed: 0})

    const scratch = await scratchDirectory('conciv-playwright-stop-')
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
