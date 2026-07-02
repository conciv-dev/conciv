import {spawn, type ChildProcess} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {Readable} from 'node:stream'
import type {Summary, TestRunResult, TestEvent, FileState} from '../shared/events.js'
import {
  defineRunner,
  runnerUnavailableError,
  type RunArgs,
  type ListResult,
  type UiServerInfo,
  type TestRunnerAdapter,
  type TestRunnerCapabilities,
  type TestRunnerManager,
} from './contract.js'
import {ChildMessageSchema, type ChildMessage} from './child-protocol.js'

export {isRunnerUnavailable, runnerUnavailableError} from './contract.js'
export type {RunnerUnavailableError} from './contract.js'

export type ChildRunnerSpec = {
  id: string
  capabilities: TestRunnerCapabilities
  childUrl: URL
  buildRunArgs: (args: RunArgs, cwd: string) => string[]
  buildListArgs: (failedOnly: boolean, cwd: string) => string[]
}

export type SpawnRunner = (args: string[], cwd: string) => ChildProcess
export type MakeManagerOptions = {spawnRunner?: SpawnRunner}

export function makeChildManager(
  spec: ChildRunnerSpec,
  cwd: string,
  options: MakeManagerOptions = {},
): TestRunnerManager {
  const unavailable = (reason: string) => runnerUnavailableError(spec.id, reason)
  const spawnRunner = options.spawnRunner ?? defaultSpawnRunner(spec.childUrl)
  const subscribers = new Set<(e: TestEvent) => void>()

  const cache: {last: TestRunResult; files: Map<string, FileState>} = {
    last: {summary: EMPTY_SUMMARY, failures: [], tests: []},
    files: new Map(),
  }

  const runBuffer: TestEvent[] = []
  const lifecycle: {child: ChildProcess | null} = {child: null}

  function driveChild(args: string[], onEvent?: (e: TestEvent) => void): Promise<ChildMessage[]> {
    return new Promise((resolve, reject) => {
      const child = spawnRunner(args, cwd)
      lifecycle.child = child
      const channel = child.stdio[3]
      if (!(channel instanceof Readable)) {
        reject(unavailable('runner did not expose its event channel (fd 3)'))
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
        if (onEvent && isTestEvent(msg)) onEvent(msg)
      })
      child.on('error', (e: Error) => {
        lifecycle.child = null
        reject(unavailable(e.message))
      })
      child.on('close', () => {
        lifecycle.child = null
        if (errState.reason !== null) {
          reject(unavailable(errState.reason))
          return
        }
        resolve(messages)
      })
    })
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

  function emit(e: TestEvent): void {
    for (const cb of subscribers) cb(e)
  }

  async function run(args: RunArgs): Promise<TestRunResult> {
    await driveChild(spec.buildRunArgs(args, cwd), (e) => {
      updateCache(e)
      emit(e)
    })
    return cache.last
  }

  async function list(failedOnly = false): Promise<ListResult> {
    const messages = await driveChild(spec.buildListArgs(failedOnly, cwd))
    const listMsg = messages.filter(isListMessage).at(-1)
    return {files: listMsg?.files ?? []}
  }

  function status(): TestRunResult {
    return cache.last
  }

  function emitSnapshot(): TestEvent {
    return {type: 'snapshot', files: [...cache.files.values()], summary: cache.last.summary, watching: false}
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

  async function openUiServer(): Promise<UiServerInfo> {
    return {available: false}
  }

  return {list, run, status, subscribeRaw, emitSnapshot, openUiServer, stop}
}

export function defineChildRunner<T extends ChildRunnerSpec>(spec: T): TestRunnerAdapter {
  return defineRunner({
    id: spec.id,
    capabilities: spec.capabilities,
    create: (cwd: string) => makeChildManager(spec, cwd),
  })
}

export function defineStubRunner(o: {
  id: string
  capabilities: TestRunnerCapabilities
  reason: string
}): TestRunnerAdapter {
  return defineRunner({
    id: o.id,
    capabilities: o.capabilities,
    create() {
      throw new Error(o.reason)
    },
  })
}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}
const TEST_EVENT_KINDS = new Set(['snapshot', 'run-start', 'test', 'file-end', 'run-end'])

function isTestEvent(msg: ChildMessage): msg is TestEvent {
  return TEST_EVENT_KINDS.has(msg.type)
}
function isListMessage(msg: ChildMessage): msg is Extract<ChildMessage, {type: 'list'}> {
  return msg.type === 'list'
}

function cleanEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {...base}
  delete env.NODE_OPTIONS
  for (const key of Object.keys(env)) {
    if (key.startsWith('VIBE_')) delete env[key]
  }
  return env
}

function defaultSpawnRunner(childUrl: URL): SpawnRunner {
  const childScript = fileURLToPath(childUrl)
  return (args, cwd) =>
    spawn(process.execPath, [childScript, ...args], {
      cwd,
      env: cleanEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
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
