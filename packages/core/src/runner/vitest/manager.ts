import {spawn, type ChildProcess} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {Readable} from 'node:stream'
import {z} from 'zod'
import type {Summary, TestError, TestRunResult, TestEvent, FileState} from '@devgent/protocol/test-types'
import type {RunArgs, ListResult, UiServerInfo, TestRunnerManager} from '@devgent/protocol/runner-types'
import {ChildMessageSchema, type ChildMessage} from './child.js'

// Runs vitest in a CLEAN child (NODE_OPTIONS + VIBE_* stripped) — running it in the dev
// server's IITM-preloaded process corrupts the live app. Child streams TestEvents as NDJSON
// on fd 3; one child per run.

export type {RunArgs, ListResult, UiServerInfo, TestRunnerManager} from '@devgent/protocol/runner-types'

// Production spawns the built child; tests inject a tsx-based spawn. stdio[3] is the NDJSON channel.
export type SpawnRunner = (args: string[], cwd: string) => ChildProcess
export type MakeVitestManagerOptions = {spawnRunner?: SpawnRunner}

const VITEST_UNAVAILABLE_TAG = 'devgent:vitest-unavailable'
export type VitestUnavailableError = Error & {[VITEST_UNAVAILABLE_TAG]: true; available: false}

export function vitestUnavailableError(reason: string): VitestUnavailableError {
  return Object.assign(new Error(`vitest unavailable: ${reason}`), {
    [VITEST_UNAVAILABLE_TAG]: true as const,
    available: false as const,
  })
}

const UnavailableTagSchema = z.object({[VITEST_UNAVAILABLE_TAG]: z.literal(true)})

export function isVitestUnavailable(e: unknown): e is VitestUnavailableError {
  return e instanceof Error && UnavailableTagSchema.safeParse(e).success
}

function defaultRunnerScript(): string {
  return fileURLToPath(new URL('./child.js', import.meta.url))
}

function cleanEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {...base}
  delete env.NODE_OPTIONS
  for (const key of Object.keys(env)) {
    if (key.startsWith('VIBE_')) delete env[key]
  }
  return env
}

function defaultSpawnRunner(args: string[], cwd: string): ChildProcess {
  return spawn(process.execPath, [defaultRunnerScript(), ...args], {
    cwd,
    env: cleanEnv(process.env),
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  })
}

const TEST_EVENT_KINDS = new Set(['snapshot', 'run-start', 'test', 'file-end', 'run-end'])
function isTestEvent(msg: ChildMessage): msg is TestEvent {
  return TEST_EVENT_KINDS.has(msg.type)
}
function isRunEnd(msg: ChildMessage): msg is Extract<TestEvent, {type: 'run-end'}> {
  return msg.type === 'run-end'
}
function isListMessage(msg: ChildMessage): msg is Extract<ChildMessage, {type: 'list'}> {
  return msg.type === 'list'
}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export function makeVitestManager(cwd: string, options: MakeVitestManagerOptions = {}): TestRunnerManager {
  const spawnRunner = options.spawnRunner ?? defaultSpawnRunner
  const subscribers = new Set<(e: TestEvent) => void>()
  // status()/emitSnapshot() answer from this between runs.
  const cache: {last: TestRunResult; files: Map<string, FileState>} = {
    last: {summary: EMPTY_SUMMARY, failures: [], tests: []},
    files: new Map(),
  }
  // Full event sequence of the last run, replayed to late subscribers. Cleared at run-start.
  const runBuffer: TestEvent[] = []
  const lifecycle: {child: ChildProcess | null} = {child: null}

  function emit(e: TestEvent): void {
    for (const cb of subscribers) cb(e)
  }

  function updateCache(e: TestEvent): void {
    if (e.type === 'run-start') {
      cache.files.clear()
      runBuffer.length = 0
    }
    if (e.type === 'file-end')
      cache.files.set(e.file, {file: e.file, state: e.ok ? 'pass' : 'fail', durationMs: e.durationMs})
    if (e.type === 'run-end') cache.last = {summary: e.summary, failures: e.failures, tests: e.tests}
    runBuffer.push(e)
  }

  function driveChild(args: string[], forward: boolean): Promise<ChildMessage[]> {
    return new Promise((resolve, reject) => {
      const child = spawnRunner(args, cwd)
      lifecycle.child = child
      const channel = child.stdio[3]
      if (!(channel instanceof Readable)) {
        reject(vitestUnavailableError('runner did not expose its event channel (fd 3)'))
        return
      }
      const messages: ChildMessage[] = []
      const errState: {reason: string | null} = {reason: null}
      const rl = createInterface({input: channel})
      rl.on('line', (line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        const msg = parseMessage(trimmed)
        if (!msg) return
        if (msg.type === 'error') {
          errState.reason = msg.reason
          return
        }
        messages.push(msg)
        if (forward && isTestEvent(msg)) {
          updateCache(msg)
          emit(msg)
        }
      })
      child.on('error', (e: Error) => {
        lifecycle.child = null
        reject(vitestUnavailableError(e.message))
      })
      child.on('close', () => {
        lifecycle.child = null
        if (errState.reason !== null) {
          reject(vitestUnavailableError(errState.reason))
          return
        }
        resolve(messages)
      })
    })
  }

  function parseMessage(line: string): ChildMessage | null {
    try {
      const result = ChildMessageSchema.safeParse(JSON.parse(line))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }

  async function run(args: RunArgs): Promise<TestRunResult> {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    const failedArgs = args.failedOnly ? ['--failed'] : []
    const runnerArgs = ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs, ...failedArgs]
    const messages = await driveChild(runnerArgs, true)
    const runEnd = messages.filter(isRunEnd).at(-1)
    const result: TestRunResult = runEnd
      ? {summary: runEnd.summary, failures: runEnd.failures, tests: runEnd.tests}
      : cache.last
    cache.last = result
    return result
  }

  async function list(failedOnly = false): Promise<ListResult> {
    const runnerArgs = ['--mode', 'list', '--cwd', cwd, ...(failedOnly ? ['--failed'] : [])]
    const messages = await driveChild(runnerArgs, false)
    const listMsg = messages.filter(isListMessage).at(-1)
    return {files: listMsg?.files ?? []}
  }

  function status(): TestRunResult {
    return cache.last
  }

  function emitSnapshot(): TestEvent {
    return {type: 'snapshot', files: [...cache.files.values()], summary: cache.last.summary, watching: false}
  }

  // Deferred: @vitest/ui needs a resident vitest server the on-demand model doesn't keep.
  async function openUiServer(): Promise<UiServerInfo> {
    return {available: false}
  }

  function subscribeRaw(cb: (e: TestEvent) => void): () => void {
    subscribers.add(cb)
    for (const e of runBuffer) cb(e)
    return () => subscribers.delete(cb)
  }

  async function stop(): Promise<void> {
    lifecycle.child?.kill('SIGTERM')
    lifecycle.child = null
  }

  return {list, run, status, subscribeRaw, emitSnapshot, openUiServer, stop}
}
