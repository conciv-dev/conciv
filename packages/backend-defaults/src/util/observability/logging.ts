import {Effect, FileSystem, Formatter, Logger, Option, Schedule, Stream, type LogLevel} from 'effect'
import path from 'path'
import {Global} from '@conciv/backend-app-api/util/global'
import {runID} from './shared.js'

export const LOG_MAX_BYTES = 50 * 1024 * 1024
export const LOG_KEEP_BYTES = 25 * 1024 * 1024
export const LOG_TRIM_INTERVAL = '1 hour'
export const LOG_TRIM_LOCK_STALE_MS = 5 * 60 * 1000
const LOG_TRIM_CHUNK = 64 * 1024

function formatter(id: string = runID()) {
  return Logger.map(Logger.formatStructured, (output) => {
    const messages = Array.isArray(output.message) ? output.message : [output.message]
    return [
      ['timestamp', output.timestamp],
      ['level', output.level],
      ['run', id],
      ...messages.flatMap((value) => (plain(value) ? flatten(value) : [['message', value] as const])),
      ...(output.cause === undefined ? [] : [['cause', output.cause] as const]),
      ...flatten(output.spans),
      ...flatten(output.annotations),
    ]
      .map(([key, value]) => `${key}=${format(value)}`)
      .join(' ')
  })
}

function flatten(
  input: Record<string, unknown>,
  prefix = '',
  seen = new WeakSet<object>(),
): Array<readonly [string, unknown]> {
  if (seen.has(input)) return [[prefix, '[Circular]']]
  seen.add(input)
  const entries = Object.entries(input)
  if (entries.length === 0 && prefix) return [[prefix, input]]
  return entries.flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return plain(value) ? flatten(value, path, seen) : [[path, value] as const]
  })
}

function plain(input: unknown): input is Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

function format(input: unknown) {
  const value = typeof input === 'string' ? input : Formatter.format(input)
  return /^[^\s="\\]+$/.test(value) ? value : JSON.stringify(value)
}

export const file = Effect.fnUntraced(function* (local = true, channel = 'local') {
  const global = yield* Global.Service
  if (!local) return path.join(global.log, 'conciv.log')
  return path.join(global.log, `conciv-${channel.replace(/[^a-zA-Z0-9._-]/g, '-')}.log`)
})

export function fileLogger(target: string, id: string = runID()) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(path.dirname(target), {recursive: true})
    const logger = yield* Logger.toFile(formatter(id), target, {flag: 'a'})
    yield* trim(target).pipe(
      Effect.ignore,
      Effect.repeat(Schedule.spaced(LOG_TRIM_INTERVAL)),
      Effect.forkScoped({startImmediately: true}),
    )
    return logger
  })
}

export const trim = Effect.fn('Logging.trim')(function* (target: string, options: {max?: number; keep?: number} = {}) {
  const max = options.max ?? LOG_MAX_BYTES
  const keep = options.keep ?? LOG_KEEP_BYTES
  const fs = yield* FileSystem.FileSystem
  const lock = `${target}.trim`
  const acquired = yield* Effect.acquireRelease(
    fs.makeDirectory(lock).pipe(
      Effect.as(true),
      Effect.catchIf(
        (error) => error.reason._tag === 'AlreadyExists',
        () => breakStaleLock(fs, lock),
      ),
    ),
    (acquired) => (acquired ? fs.remove(lock, {recursive: true}).pipe(Effect.ignore) : Effect.void),
  )
  if (!acquired) return
  const size = Number((yield* fs.stat(target)).size)
  if (size <= max) return
  const handle = yield* fs.open(target, {flag: 'r+'})
  const start = yield* lineStart(handle, size - keep)
  yield* handle.seek(0n, 'start')
  const written = yield* fs.stream(target, {offset: start, chunkSize: LOG_TRIM_CHUNK}).pipe(
    Stream.runFoldEffect(
      () => 0,
      (total, chunk) => handle.writeAll(chunk).pipe(Effect.as(total + chunk.length)),
    ),
  )
  yield* handle.truncate(written)
}, Effect.scoped)

function breakStaleLock(fs: FileSystem.FileSystem, lock: string) {
  return Effect.gen(function* () {
    const info = yield* fs.stat(lock).pipe(Effect.option)
    const modified = Option.flatMap(info, (value) => value.mtime)
    if (Option.isNone(modified)) return false
    if (Date.now() - modified.value.getTime() < LOG_TRIM_LOCK_STALE_MS) return false
    yield* fs.remove(lock, {recursive: true}).pipe(Effect.ignore)
    return false
  })
}

function lineStart(handle: FileSystem.File, from: number) {
  return Effect.gen(function* () {
    let cursor = from
    while (true) {
      yield* handle.seek(BigInt(cursor), 'start')
      const chunk = yield* handle.readAlloc(LOG_TRIM_CHUNK)
      if (Option.isNone(chunk)) return cursor
      const newline = chunk.value.indexOf(10)
      if (newline !== -1) return cursor + newline + 1
      cursor += chunk.value.length
    }
  })
}

const stderrLogger = Logger.make((options) => {
  if (process.env.CONCIV_PRINT_LOGS !== '1') return
  process.stderr.write(formatter().log(options) + '\n')
})

const levels = {
  DEBUG: 'Debug',
  INFO: 'Info',
  WARN: 'Warn',
  ERROR: 'Error',
} as const satisfies Record<string, LogLevel.LogLevel>

function isLevelName(value: string): value is keyof typeof levels {
  return Object.hasOwn(levels, value)
}

export function minimumLogLevel() {
  const value = process.env.CONCIV_LOG_LEVEL?.toUpperCase()
  return value && isLevelName(value) ? levels[value] : levels.INFO
}

export function loggers(local = true, channel = 'local') {
  return [file(local, channel).pipe(Effect.flatMap((target) => fileLogger(target))), stderrLogger]
}
