import {Layer, Logger, References} from 'effect'
import {initLogger, log} from 'evlog'
import {z} from 'zod'

const LogLevelSchema = z.enum(['off', 'error', 'warn', 'info', 'debug', 'trace'])
type LogLevel = z.infer<typeof LogLevelSchema>

function readLogLevel(sources: {readonly flag?: string | undefined; readonly env?: string | undefined}): LogLevel {
  const named = [sources.flag, sources.env].find((value) => value !== undefined && value !== '')
  const parsed = LogLevelSchema.safeParse(named?.toLowerCase())
  return parsed.success ? parsed.data : 'off'
}

export const logFlags = {
  verbose: {
    type: 'boolean',
    default: false,
    description: "print the CLI's debug logs to stderr (same as --log-level debug)",
  },
  'log-level': {
    type: 'string',
    description:
      "print the CLI's logs at this level or above to stderr: off (the default), error, warn, info, debug, trace",
  },
} as const

export function flaggedLogLevel(args: {
  readonly verbose: boolean
  readonly 'log-level'?: string | undefined
}): LogLevel {
  return readLogLevel({
    flag: args['log-level'] ?? (args.verbose ? 'debug' : undefined),
    env: process.env.CONCIV_LOG_LEVEL,
  })
}

type Severity = Logger.Options<unknown>['logLevel']

const writers: Partial<Record<Severity, (tag: string, message: string) => void>> = {
  Trace: (tag, message) => log.trace(tag, message),
  Debug: (tag, message) => log.debug(tag, message),
  Info: (tag, message) => log.info(tag, message),
  Warn: (tag, message) => log.warn(tag, message),
  Error: (tag, message) => log.error(tag, message),
  Fatal: (tag, message) => log.error(tag, message),
}

function readText(message: unknown): string {
  const parts: readonly unknown[] = Array.isArray(message) ? message : [message]
  return parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')
}

export function publishLogs(tag: string, level: LogLevel) {
  initLogger({
    enabled: level !== 'off',
    ...(level === 'off' ? {} : {minLevel: level}),
    env: {service: 'conciv-publish'},
    pretty: false,
    silent: true,
    _suppressDrainWarning: true,
    drain: ({event}) => {
      process.stderr.write(`${JSON.stringify(event)}\n`)
    },
  })
  const evlog = Logger.make((options) => {
    const write = writers[options.logLevel]
    if (!write) return
    const {message, annotations} = Logger.formatStructured.log(options)
    const owner = typeof annotations['package'] === 'string' ? `${annotations['package']}: ` : ''
    write(tag, `${owner}${readText(message)}`)
  })
  return Layer.mergeAll(
    Logger.layer([evlog], {mergeWithExisting: false}),
    Layer.succeed(References.MinimumLogLevel, 'All'),
  )
}
