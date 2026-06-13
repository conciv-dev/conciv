import {spawn, type ChildProcess} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {Readable} from 'node:stream'
import type {Summary, TestError, TestRunResult, TestEvent, FileState} from '@devgent/protocol/test-types'
import type {RunArgs, ListResult, UiServerInfo, TestRunnerManager} from '@devgent/protocol/runner-types'
import type {ChildMessage} from './child.js'

// Drives the previewed app's vitest OUT OF PROCESS. the devgent dev server runs under an
// import-in-the-middle preload (how the plugin is injected); embedding vitest in that same
// process corrupts the live app's vite transforms (the app starts 500ing). So each request
// spawns runner/child.js as a CLEAN child (NODE_OPTIONS + VIBE_* stripped), which streams
// TestEvents as NDJSON on fd 3. The manager forwards them to the SSE bus as they arrive and
// resolves run()/list() on the child's terminal message. On-demand (one child per run);
// watch-on-save auto-rerun is a deferred follow-up (needs a persistent child).

export type {RunArgs, ListResult, UiServerInfo, TestRunnerManager} from '@devgent/protocol/runner-types'

// Injectable spawn seam: production runs `node <built child.js>`; tests run the child via
// tsx on the .ts source (no build needed). Returns a ChildProcess whose stdio[3] is the
// NDJSON channel.
export type SpawnRunner = (args: string[], cwd: string) => ChildProcess
export type MakeVitestManagerOptions = {spawnRunner?: SpawnRunner}

// Tagged error so the route can translate a missing/unsupported vitest (or a runner crash)
// into a typed 422 instead of an opaque 500. Factory, not a class (functions-not-classes).
const VITEST_UNAVAILABLE_TAG = 'devgent:vitest-unavailable'
export type VitestUnavailableError = Error & {[VITEST_UNAVAILABLE_TAG]: true; available: false}

export function vitestUnavailableError(reason: string): VitestUnavailableError {
  // Built whole via Object.assign — its result type is exactly VitestUnavailableError, no cast.
  return Object.assign(new Error(`vitest unavailable: ${reason}`), {
    [VITEST_UNAVAILABLE_TAG]: true as const,
    available: false as const,
  })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function isVitestUnavailable(e: unknown): e is VitestUnavailableError {
  return e instanceof Error && isRecord(e) && e[VITEST_UNAVAILABLE_TAG] === true
}

// build output runner/child.js sits next to this module at runtime.
function defaultRunnerScript(): string {
  return fileURLToPath(new URL('./child.js', import.meta.url))
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

// Guard a parsed NDJSON value into a ChildMessage (discriminated on a string `type`) — no cast.
function isChildMessage(v: unknown): v is ChildMessage {
  return isRecord(v) && typeof v.type === 'string'
}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export function makeVitestManager(cwd: string, options: MakeVitestManagerOptions = {}): TestRunnerManager {
  const spawnRunner = options.spawnRunner ?? defaultSpawnRunner
  const subscribers = new Set<(e: TestEvent) => void>()
  // Last-run cache so status()/emitSnapshot() can answer between runs (a reconnecting
  // widget recovers the latest tree + summary). files keyed by path → last state.
  const cache: {last: TestRunResult; files: Map<string, FileState>} = {
    last: {summary: EMPTY_SUMMARY, failures: [], tests: []},
    files: new Map(),
  }
  // The most recent run's full event sequence (run-start → … → run-end), kept so a widget
  // that subscribes mid-run OR after it (e.g. the card is injected only once the run is
  // already underway) is replayed the whole run and rebuilds the per-test tree — not just
  // the file-level snapshot. Cleared at each run-start.
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

  // Spawn a runner child, forward its TestEvents to the bus as they arrive, and resolve with
  // all messages once it exits. Rejects with a typed error if the child reports one.
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
      const v: unknown = JSON.parse(line)
      return isChildMessage(v) ? v : null
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
    // watching:false — on-demand runs only (no persistent watcher yet).
    return {type: 'snapshot', files: [...cache.files.values()], summary: cache.last.summary, watching: false}
  }

  // Deferred: serving @vitest/ui requires a resident vitest API server, which the
  // out-of-process on-demand model doesn't keep. Always reports unavailable so the widget
  // hides the link; never throws. (Revisit alongside the persistent-watch follow-up.)
  async function openUiServer(): Promise<UiServerInfo> {
    return {available: false}
  }

  function subscribeRaw(cb: (e: TestEvent) => void): () => void {
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
