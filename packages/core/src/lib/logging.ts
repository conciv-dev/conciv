import {Effect, Formatter, Logger, type Context} from 'effect'
import {invert} from 'es-toolkit'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type LogEntry = {
  readonly level: LogLevel
  readonly message: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly cause?: unknown
}

export type LogWriter = (entry: LogEntry) => void

export type LogOptions = {
  readonly emit: LogWriter
}

type Severity = Logger.Options<unknown>['logLevel']

const levels = {
  trace: 'Trace',
  debug: 'Debug',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
  fatal: 'Fatal',
} satisfies Record<LogLevel, Severity>

const levelNames: Partial<Record<Severity, LogLevel>> = invert(levels)

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readDetails(data: readonly unknown[]): Readonly<Record<string, unknown>> | undefined {
  const [only] = data
  return data.length === 1 && isRecord(only) ? only : undefined
}

function readAttributes(
  entry: ReturnType<typeof Logger.formatStructured.log>,
  data: readonly unknown[],
  details: Readonly<Record<string, unknown>> | undefined,
) {
  const {cause: _cause, ...detailAttributes} = details ?? {}
  const spans = Object.keys(entry.spans).length > 0 ? {spans: entry.spans} : {}
  const rest = !details && data.length > 0 ? {data: data.length === 1 ? data[0] : data} : {}
  return {...entry.annotations, ...detailAttributes, ...spans, ...rest}
}

function readEntry(options: Logger.Options<unknown>, level: LogLevel): LogEntry {
  const entry = Logger.formatStructured.log(options)
  const values: readonly unknown[] = Array.isArray(entry.message) ? entry.message : [entry.message]
  const [message, ...data] = values
  const details = readDetails(data)
  const attributes = readAttributes(entry, data, details)
  const cause = entry.cause ?? details?.cause
  return {
    level,
    message: typeof message === 'string' ? message : Formatter.format(message),
    ...(Object.keys(attributes).length > 0 ? {attributes} : {}),
    ...(cause === undefined ? {} : {cause}),
  }
}

function emitSafely(log: LogOptions, entry: LogEntry): void {
  try {
    log.emit(entry)
  } catch {
    return
  }
}

export function layer(log?: LogOptions) {
  const logger = Logger.make((options) => {
    const level = levelNames[options.logLevel]
    if (!log || !level) return
    emitSafely(log, readEntry(options, level))
  })
  return Logger.layer([logger], {mergeWithExisting: true})
}

export type Log = (entry: Effect.Effect<void>) => void

type Forking = {readonly runFork: (effect: Effect.Effect<void>) => unknown}

export function logOnRuntime(runtime: Forking): Log {
  return (entry) => {
    runtime.runFork(entry)
  }
}

export function logOnContext<Services>(context: Context.Context<Services>): Log {
  return (entry) => {
    Effect.runForkWith(context)(entry)
  }
}
