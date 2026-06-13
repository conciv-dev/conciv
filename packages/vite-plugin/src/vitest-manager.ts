import {spawn, type ChildProcess} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import type {Readable} from 'node:stream'
import {
  type Summary,
  type TestError,
  type RunResult,
  type VitestEvent,
  type FileState,
} from '@devgent/protocol/vitest-types'
import type {ChildMessage} from './vitest-runner-child.js'

// Drives the previewed app's vitest OUT OF PROCESS. the devgent dev server runs under an
// import-in-the-middle preload (how the plugin is injected); embedding vitest in that same
// process corrupts the live app's vite transforms (the app starts 500ing). So each request
// spawns vitest-runner-child.js as a CLEAN child (NODE_OPTIONS + VIBE_* stripped), which
// streams VitestEvents as NDJSON on fd 3. The manager forwards them to the SSE bus as they
// arrive and resolves run()/list() on the child's terminal message. On-demand (one child
// per run); watch-on-save auto-rerun is a deferred follow-up (needs a persistent child).

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}
export type {RunResult}
export type ListResult = {files: {file: string; relPath: string; lastState?: string}[]}
export type UiServerInfo = {available: boolean; url?: string}

// Injectable spawn seam: production runs `node <built child.js>`; tests run the child via
// tsx on the .ts source (no build needed). Returns a ChildProcess whose stdio[3] is the
// NDJSON channel.
export type SpawnRunner = (args: string[], cwd: string) => ChildProcess
export type MakeVitestManagerOptions = {spawnRunner?: SpawnRunner}

export type VitestManager = {
  list: (failedOnly?: boolean) => Promise<ListResult>
  run: (args: RunArgs) => Promise<RunResult>
  status: () => RunResult
  subscribeRaw: (cb: (e: VitestEvent) => void) => () => void
  emitSnapshot: () => VitestEvent
  openUiServer: () => Promise<UiServerInfo>
  stop: () => Promise<void>
}

// Tagged error so the route can translate a missing/unsupported vitest (or a runner crash)
// into a typed 422 instead of an opaque 500. Factory, not a class (functions-not-classes).
const VITEST_UNAVAILABLE_TAG = 'devgent:vitest-unavailable'
export type VitestUnavailableError = Error & {[VITEST_UNAVAILABLE_TAG]: true; available: false}

export function vitestUnavailableError(reason: string): VitestUnavailableError {
  const err = new Error(`vitest unavailable: ${reason}`) as VitestUnavailableError
  return Object.assign(err, {[VITEST_UNAVAILABLE_TAG]: true as const, available: false as const})
}

export function isVitestUnavailable(e: unknown): e is VitestUnavailableError {
  return e instanceof Error && (e as Partial<VitestUnavailableError>)[VITEST_UNAVAILABLE_TAG] === true
}

// build/chat/vitest-runner-child.js sits next to this module at runtime.
function defaultRunnerScript(): string {
  return fileURLToPath(new URL('./vitest-runner-child.js', import.meta.url))
}

// A clean child env: strip the dev server's IITM preload (NODE_OPTIONS=`… --import preload`)
// and every VIBE_* so the runner is an ordinary process. Running vitest WITH the preload is
// exactly what corrupts the dev server, so this stripping is the crux of the fix.
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

const VITEST_EVENT_KINDS = new Set(['snapshot', 'run-start', 'test', 'file-end', 'run-end'])
function isVitestEvent(msg: ChildMessage): msg is VitestEvent {
  return VITEST_EVENT_KINDS.has(msg.type)
}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export function makeVitestManager(cwd: string, options: MakeVitestManagerOptions = {}): VitestManager {
  const spawnRunner = options.spawnRunner ?? defaultSpawnRunner
  const subscribers = new Set<(e: VitestEvent) => void>()
  // Last-run cache so status()/emitSnapshot() can answer between runs (a reconnecting
  // widget recovers the latest tree + summary). files keyed by path → last state.
  const cache = {
    last: {summary: EMPTY_SUMMARY, failures: [] as TestError[], tests: []} as RunResult,
    files: new Map<string, FileState>(),
  }
  // The most recent run's full event sequence (run-start → … → run-end), kept so a widget
  // that subscribes mid-run OR after it (e.g. the card is injected only once the run is
  // already underway) is replayed the whole run and rebuilds the per-test tree — not just
  // the file-level snapshot. Cleared at each run-start.
  const runBuffer: VitestEvent[] = []
  const lifecycle = {child: null as ChildProcess | null}

  function emit(e: VitestEvent): void {
    for (const cb of subscribers) cb(e)
  }

  function updateCache(e: VitestEvent): void {
    if (e.type === 'run-start') {
      cache.files.clear()
      runBuffer.length = 0
    }
    if (e.type === 'file-end')
      cache.files.set(e.file, {file: e.file, state: e.ok ? 'pass' : 'fail', durationMs: e.durationMs})
    if (e.type === 'run-end') cache.last = {summary: e.summary, failures: e.failures, tests: e.tests}
    runBuffer.push(e)
  }

  // Spawn a runner child, forward its VitestEvents to the bus as they arrive, and resolve
  // with all messages once it exits. Rejects with a typed error if the child reports one.
  function driveChild(args: string[], forward: boolean): Promise<ChildMessage[]> {
    return new Promise((resolve, reject) => {
      const child = spawnRunner(args, cwd)
      lifecycle.child = child
      const channel = child.stdio[3] as Readable | null | undefined
      if (!channel) {
        reject(vitestUnavailableError('runner did not expose its event channel (fd 3)'))
        return
      }
      const messages: ChildMessage[] = []
      const errState = {reason: null as string | null}
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
        if (forward && isVitestEvent(msg)) {
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
      return JSON.parse(line) as ChildMessage
    } catch {
      return null
    }
  }

  async function run(args: RunArgs): Promise<RunResult> {
    const patternArgs = (args.patterns ?? []).flatMap((p) => ['--pattern', p])
    const nameArgs = args.testNamePattern ? ['--name', args.testNamePattern] : []
    const failedArgs = args.failedOnly ? ['--failed'] : []
    const runnerArgs = ['--mode', 'run', '--cwd', cwd, ...patternArgs, ...nameArgs, ...failedArgs]
    const messages = await driveChild(runnerArgs, true)
    const runEnd = messages.filter((m): m is Extract<VitestEvent, {type: 'run-end'}> => m.type === 'run-end').at(-1)
    const result: RunResult = runEnd
      ? {summary: runEnd.summary, failures: runEnd.failures, tests: runEnd.tests}
      : cache.last
    cache.last = result
    return result
  }

  async function list(failedOnly = false): Promise<ListResult> {
    const runnerArgs = ['--mode', 'list', '--cwd', cwd, ...(failedOnly ? ['--failed'] : [])]
    const messages = await driveChild(runnerArgs, false)
    const listMsg = messages.filter((m): m is Extract<ChildMessage, {type: 'list'}> => m.type === 'list').at(-1)
    return {files: listMsg?.files ?? []}
  }

  function status(): RunResult {
    return cache.last
  }

  function emitSnapshot(): VitestEvent {
    // watching:false — on-demand runs only (no persistent watcher yet).
    return {type: 'snapshot', files: [...cache.files.values()], summary: cache.last.summary, watching: false}
  }

  // Deferred: serving @vitest/ui requires a resident vitest API server, which the
  // out-of-process on-demand model doesn't keep. Always reports unavailable so the widget
  // hides the link; never throws. (Revisit alongside the persistent-watch follow-up.)
  async function openUiServer(): Promise<UiServerInfo> {
    return {available: false}
  }

  function subscribeRaw(cb: (e: VitestEvent) => void): () => void {
    subscribers.add(cb)
    // Replay the latest run so a late subscriber rebuilds the full per-test tree (the
    // snapshot the route sends first only carries file-level state). Harmless when empty.
    for (const e of runBuffer) cb(e)
    return () => subscribers.delete(cb)
  }

  async function stop(): Promise<void> {
    lifecycle.child?.kill('SIGTERM')
    lifecycle.child = null
  }

  return {list, run, status, subscribeRaw, emitSnapshot, openUiServer, stop}
}
