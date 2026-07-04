import {spawn, type IPty} from 'node-pty'
import type {TtyCommand, TtyServerControl} from '@conciv/protocol/terminal-types'
import {createOscBusyTracker, type OscBusyTracker} from './osc-busy.js'
import {createFrameInjector, type FrameInjector} from './frame-injector.js'
import {ensureSpawnHelperExecutable} from './spawn-helper-fix.js'

const INTERRUPT_BYTE = String.fromCharCode(3)
const IDLE_EVICT_MS = 5 * 60 * 1000
const REPLAY_CAP = 4 * 1024 * 1024
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

export type TtySink = {data(chunk: string): void; control(frame: TtyServerControl): void}

export type TtySession = {
  write(data: string): void
  interrupt(): void
  inject(text: string): void
  resize(cols: number, rows: number): void
  attach(sink: TtySink): () => void
  busy(): boolean
  kill(): void
  exited(): {code: number} | null
}

export type TtySessions = {
  open(sessionId: string, command: TtyCommand, cwd: string): TtySession
  get(sessionId: string): TtySession | undefined
  close(sessionId: string): void
  shutdown(): void
}

type Entry = {
  pty: IPty | null
  session: TtySession
  replay: string[]
  replaySize: number
  sinks: Set<TtySink>
  tracker: OscBusyTracker
  injector: FrameInjector
  exit: {code: number} | null
  error: string | null
  idle: ReturnType<typeof setTimeout> | null
}

export function createTtySessions(opts?: {idleEvictMs?: number; replayCap?: number}): TtySessions {
  const idleEvictMs = opts?.idleEvictMs ?? IDLE_EVICT_MS
  const replayCap = opts?.replayCap ?? REPLAY_CAP
  const entries = new Map<string, Entry>()

  const drop = (sessionId: string): void => {
    const entry = entries.get(sessionId)
    if (!entry) return
    entries.delete(sessionId)
    if (entry.idle) clearTimeout(entry.idle)
    if (!entry.exit) entry.pty?.kill()
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
    entry.replay.push(chunk)
    entry.replaySize += chunk.length
    while (entry.replaySize > replayCap && entry.replay.length > 1) {
      const head = entry.replay.shift()
      if (head) entry.replaySize -= head.length
    }
  }

  const broadcast = (entry: Entry, frame: TtyServerControl): void => {
    for (const sink of entry.sinks) sink.control(frame)
  }

  const spawnEnv = (command: TtyCommand): Record<string, string | undefined> => {
    const prefixes = command.unsetEnvPrefixes ?? []
    const kept = Object.entries(process.env).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix)))
    return {...Object.fromEntries(kept), ...command.env}
  }

  const spawnPty = (entry: Entry, command: TtyCommand, cwd: string): void => {
    ensureSpawnHelperExecutable()
    try {
      entry.pty = spawn(command.bin, command.args, {
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        cwd,
        env: spawnEnv(command),
      })
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
      entry.exit = {code: -1}
      return
    }
    entry.pty.onData((chunk) => {
      entry.tracker.feed(chunk)
      entry.injector.feed(chunk)
    })
    entry.pty.onExit(({exitCode}) => {
      entry.exit = {code: exitCode}
      broadcast(entry, {type: 'exit', code: exitCode})
    })
  }

  const open = (sessionId: string, command: TtyCommand, cwd: string): TtySession => {
    drop(sessionId)
    const session: TtySession = {
      write: (data) => {
        const entry = entries.get(sessionId)
        if (entry && !entry.exit) entry.pty?.write(data)
      },
      interrupt: () => {
        const entry = entries.get(sessionId)
        if (entry && !entry.exit) entry.pty?.write(INTERRUPT_BYTE)
      },
      inject: (text) => {
        const entry = entries.get(sessionId)
        if (entry && !entry.exit) entry.injector.inject(text)
      },
      resize: (cols, rows) => {
        const entry = entries.get(sessionId)
        if (entry && !entry.exit) entry.pty?.resize(cols, rows)
      },
      attach: (sink) => {
        const entry = entries.get(sessionId)
        if (!entry) {
          sink.control({type: 'error', message: 'terminal session gone'})
          return () => {}
        }
        for (const chunk of entry.replay) sink.data(chunk)
        if (entry.error) sink.control({type: 'error', message: entry.error})
        if (entry.exit && !entry.error) sink.control({type: 'exit', code: entry.exit.code})
        entry.sinks.add(sink)
        armIdle(sessionId, entry)
        return () => {
          entry.sinks.delete(sink)
          armIdle(sessionId, entry)
        }
      },
      busy: () => entries.get(sessionId)?.tracker.busy() ?? false,
      kill: () => drop(sessionId),
      exited: () => entries.get(sessionId)?.exit ?? null,
    }
    const entry: Entry = {
      pty: null,
      session,
      replay: [],
      replaySize: 0,
      sinks: new Set(),
      tracker: createOscBusyTracker(),
      injector: createFrameInjector((chunk) => {
        record(entry, chunk)
        for (const sink of entry.sinks) sink.data(chunk)
      }),
      exit: null,
      error: null,
      idle: null,
    }
    entries.set(sessionId, entry)
    spawnPty(entry, command, cwd)
    return session
  }

  return {
    open,
    get: (sessionId) => entries.get(sessionId)?.session,
    close: drop,
    shutdown: () => {
      for (const id of entries.keys()) drop(id)
    },
  }
}
