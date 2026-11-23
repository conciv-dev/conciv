import {randomUUID} from 'node:crypto'
import type {IPty} from '@lydell/node-pty'
import {once} from 'es-toolkit'
import type {TtyCommand, TtyServerControl} from '@conciv/protocol/terminal-types'
import {constants} from 'node:fs'
import {access, chmod} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {createRequire} from 'node:module'

const SEQUENCE = /\u001b\]9;4;(\d+)[^\u0007\u001b]*(?:\u0007|\u001b\\)/g
const OSC_CARRY_MAX = 64

type OscBusyTracker = {
  feed(chunk: string): void
  busy(): boolean
  onChange(cb: (busy: boolean) => void): void
}

function createOscBusyTracker(): OscBusyTracker {
  const state = {carry: '', busy: false}
  const listeners: ((busy: boolean) => void)[] = []

  const set = (busy: boolean): void => {
    if (busy === state.busy) return
    state.busy = busy
    for (const cb of listeners) cb(busy)
  }

  const feed = (chunk: string): void => {
    const text = state.carry + chunk
    const cursor = {end: 0}
    for (const match of text.matchAll(SEQUENCE)) {
      set(match[1] !== '0')
      cursor.end = match.index + match[0].length
    }
    const rest = text.slice(cursor.end)
    const tail = rest.lastIndexOf('\u001b')
    state.carry = tail >= 0 && rest.length - tail <= OSC_CARRY_MAX ? rest.slice(tail) : ''
  }

  return {
    feed,
    busy: () => state.busy,
    onChange: (cb) => listeners.push(cb),
  }
}

const MARKER = /\u001b\[\?2026([hl])/g
const FRAME_CARRY_MAX = 16
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b./g
const SGR = /^\u001b\[[0-9;]*m$/

type FrameInjector = {
  feed(chunk: string): void
  inject(text: string): void
}

function sanitizeInjection(text: string): string {
  return text.replaceAll(ANSI_SEQUENCE, (sequence) => (SGR.test(sequence) ? sequence : ''))
}

function createFrameInjector(write: (chunk: string) => void): FrameInjector {
  const queue: string[] = []
  const state = {carry: '', inFrame: false, queue, written: false}

  const flush = (): void => {
    for (const text of state.queue.splice(0)) {
      write(`${state.written ? '\r\n' : ''}${text}\r\n`)
      state.written = true
    }
  }

  const feed = (chunk: string): void => {
    write(chunk)
    state.written ||= chunk.length > 0
    const text = state.carry + chunk
    const cursor = {end: 0}
    for (const match of text.matchAll(MARKER)) {
      state.inFrame = match[1] === 'h'
      cursor.end = match.index + match[0].length
    }
    const rest = text.slice(cursor.end)
    const tail = rest.lastIndexOf('\u001b')
    state.carry = tail >= 0 && rest.length - tail <= FRAME_CARRY_MAX ? rest.slice(tail) : ''
    if (!state.inFrame) flush()
  }

  const inject = (text: string): void => {
    state.queue.push(sanitizeInjection(text))
    if (!state.inFrame) flush()
  }

  return {feed, inject}
}

async function ensureSpawnHelperExecutable(): Promise<void> {
  if (process.platform !== 'darwin') return
  const helper = resolveSpawnHelper()
  if (!helper) return
  const present = await access(helper).then(
    () => true,
    () => false,
  )
  if (!present) return
  await access(helper, constants.X_OK).catch(() => chmod(helper, 0o755))
}

function resolveSpawnHelper(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const platformRequire = createRequire(require.resolve('@lydell/node-pty'))
    const packageRoot = dirname(platformRequire.resolve(`@lydell/node-pty-darwin-${process.arch}/package.json`))
    return join(packageRoot, 'spawn-helper')
  } catch {
    return null
  }
}

const INTERRUPT_BYTE = String.fromCharCode(3)
const INTERRUPT_DEBOUNCE_MS = 1000
const IDLE_EVICT_MS = 5 * 60 * 1000
const REPLAY_CAP = 4 * 1024 * 1024
const REPLAY_PIECE = 64 * 1024
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

type Spawn = typeof import('@lydell/node-pty').spawn

declare module '@lydell/node-pty' {
  interface IPty {
    on(event: 'close', listener: () => void): void
  }
}

const loadSpawn = once((): Promise<Spawn> =>
  ensureSpawnHelperExecutable()
    .then(() => import('@lydell/node-pty'))
    .then(
      (module) => module.spawn,
      (error: unknown) => () => {
        throw error
      },
    ),
)

export type TtySink = {data(chunk: string, end: number): void; control(frame: TtyServerControl): void}

export type TtySession = {
  id: string
  sessionId: string
  owner: string
  admitted: ReadonlyArray<string | null>
  write(data: string): void
  interrupt(): void
  inject(text: string): void
  resize(cols: number, rows: number): void
  size(): {cols: number; rows: number}
  cursor(): number
  attach(sink: TtySink, from?: number): () => void
  busy(): boolean
  kill(): void
  exited(): {code: number} | null
}

export type PtySize = {cols: number; rows: number}

export type TtySessions = {
  open(sessionId: string, command: TtyCommand, cwd: string, owner: string, size?: PtySize): Promise<TtySession>
  get(sessionId: string): TtySession | undefined
  find(id: string): TtySession | undefined
  close(sessionId: string): void
  shutdown(): void
}

type PtyStatus =
  | {kind: 'running'; pty: IPty}
  | {kind: 'closed'; pty: IPty}
  | {kind: 'exited'; code: number}
  | {kind: 'failed'; message: string}

type Entry = {
  status: PtyStatus
  session: TtySession
  replay: string[]
  replaySize: number
  written: number
  sinks: Set<TtySink>
  tracker: OscBusyTracker
  injector: FrameInjector
  idle: ReturnType<typeof setTimeout> | null
  lastInterruptAt: number
}

function runningPty(entry: Entry | undefined): IPty | null {
  return entry?.status.kind === 'running' ? entry.status.pty : null
}

function spawnedPty(status: PtyStatus | undefined): IPty | null {
  return status?.kind === 'running' || status?.kind === 'closed' ? status.pty : null
}

function readExit(status: PtyStatus | undefined): {code: number} | null {
  if (status?.kind === 'exited') return {code: status.code}
  if (status?.kind === 'failed') return {code: -1}
  return null
}

function replayTo(entry: Entry, sink: TtySink, from: number | undefined): void {
  const replay = entry.replay.join('')
  const start = entry.written - replay.length
  for (let offset = Math.max(0, (from ?? start) - start); offset < replay.length; offset += REPLAY_PIECE) {
    const piece = replay.slice(offset, offset + REPLAY_PIECE)
    sink.data(piece, start + offset + piece.length)
  }
}

export function createTtySessions(opts: {env: Readonly<Record<string, string>>; idleEvictMs?: number}): TtySessions {
  const idleEvictMs = opts.idleEvictMs ?? IDLE_EVICT_MS
  const entries = new Map<string, Entry>()

  const drop = (sessionId: string): void => {
    const entry = entries.get(sessionId)
    if (!entry) return
    entries.delete(sessionId)
    if (entry.idle) clearTimeout(entry.idle)
    spawnedPty(entry.status)?.kill()
  }

  const armIdle = (sessionId: string, entry: Entry): void => {
    if (entry.idle) clearTimeout(entry.idle)
    entry.idle = null
    if (entry.sinks.size > 0) return
    entry.idle = setTimeout(() => {
      if (entry.sinks.size === 0 && !entry.tracker.busy()) drop(sessionId)
    }, idleEvictMs)
    entry.idle.unref?.()
  }

  const record = (entry: Entry, chunk: string): void => {
    entry.written += chunk.length
    entry.replay.push(chunk)
    entry.replaySize += chunk.length
    while (entry.replaySize > REPLAY_CAP && entry.replay.length > 1) {
      const head = entry.replay.shift()
      if (head) entry.replaySize -= head.length
    }
  }

  const broadcast = (entry: Entry, frame: TtyServerControl): void => {
    for (const sink of entry.sinks) sink.control(frame)
  }

  const spawnEnv = (command: TtyCommand): Record<string, string | undefined> => {
    const prefixes = command.unsetEnvPrefixes ?? []
    const kept = Object.entries(opts.env).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix)))
    return {...Object.fromEntries(kept), ...command.env}
  }

  const spawnPty = (spawn: Spawn, command: TtyCommand, cwd: string, size: PtySize | undefined): PtyStatus => {
    try {
      const pty = spawn(command.bin, command.args, {
        name: 'xterm-256color',
        cols: size?.cols ?? DEFAULT_COLS,
        rows: size?.rows ?? DEFAULT_ROWS,
        cwd,
        env: spawnEnv(command),
      })
      return {kind: 'running', pty}
    } catch (error) {
      return {kind: 'failed', message: error instanceof Error ? error.message : String(error)}
    }
  }

  const follow = (entry: Entry, pty: IPty): void => {
    pty.onData((chunk) => {
      entry.tracker.feed(chunk)
      entry.injector.feed(chunk)
    })
    pty.on('close', () => {
      if (entry.status.kind === 'running') entry.status = {kind: 'closed', pty}
    })
    pty.onExit(({exitCode}) => {
      entry.status = {kind: 'exited', code: exitCode}
      broadcast(entry, {type: 'exit', code: exitCode})
    })
  }

  const open = async (
    sessionId: string,
    command: TtyCommand,
    cwd: string,
    owner: string,
    size?: PtySize,
  ): Promise<TtySession> => {
    const spawn = await loadSpawn()
    drop(sessionId)
    const session: TtySession = {
      id: `pty_${randomUUID()}`,
      sessionId,
      owner,
      admitted: [],
      write: (data) => runningPty(entries.get(sessionId))?.write(data),
      interrupt: () => {
        const entry = entries.get(sessionId)
        const pty = runningPty(entry)
        if (!entry || !pty) return
        const now = Date.now()
        if (now - entry.lastInterruptAt < INTERRUPT_DEBOUNCE_MS) return
        entry.lastInterruptAt = now
        pty.write(INTERRUPT_BYTE)
      },
      inject: (text) => {
        const entry = entries.get(sessionId)
        if (entry && runningPty(entry)) entry.injector.inject(text)
      },
      resize: (cols, rows) => runningPty(entries.get(sessionId))?.resize(cols, rows),
      size: () => {
        const pty = spawnedPty(entries.get(sessionId)?.status)
        return pty ? {cols: pty.cols, rows: pty.rows} : {cols: DEFAULT_COLS, rows: DEFAULT_ROWS}
      },
      cursor: () => entries.get(sessionId)?.written ?? 0,
      attach: (sink, from) => {
        const entry = entries.get(sessionId)
        if (!entry) {
          sink.control({type: 'error', message: 'terminal session gone'})
          return () => {}
        }
        replayTo(entry, sink, from)
        sink.control({type: 'busy', busy: entry.tracker.busy()})
        if (entry.status.kind === 'failed') sink.control({type: 'error', message: entry.status.message})
        if (entry.status.kind === 'exited') sink.control({type: 'exit', code: entry.status.code})
        entry.sinks.add(sink)
        armIdle(sessionId, entry)
        return () => {
          entry.sinks.delete(sink)
          armIdle(sessionId, entry)
        }
      },
      busy: () => entries.get(sessionId)?.tracker.busy() ?? false,
      kill: () => drop(sessionId),
      exited: () => readExit(entries.get(sessionId)?.status),
    }
    const status = spawnPty(spawn, command, cwd, size)
    const entry: Entry = {
      status,
      session,
      replay: [],
      replaySize: 0,
      written: 0,
      sinks: new Set(),
      tracker: createOscBusyTracker(),
      injector: createFrameInjector((chunk) => {
        record(entry, chunk)
        for (const sink of entry.sinks) sink.data(chunk, entry.written)
      }),
      idle: null,
      lastInterruptAt: 0,
    }
    entry.tracker.onChange((busy) => broadcast(entry, {type: 'busy', busy}))
    entries.set(sessionId, entry)
    if (status.kind === 'running') follow(entry, status.pty)
    return session
  }

  return {
    open,
    get: (sessionId) => entries.get(sessionId)?.session,
    find: (id) => [...entries.values()].find((entry) => entry.session.id === id)?.session,
    close: drop,
    shutdown: () => {
      for (const id of entries.keys()) drop(id)
    },
  }
}
