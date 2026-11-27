import {z} from 'zod'
import {argument, command, description, name, option, schema, toggle} from '@bomb.sh/router'
import {LogLevelSchema, type LogLevel} from '@conciv/types/config-types'
import type {EngineClient} from '@conciv/client'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {runRpc, type CliTarget} from './request.js'
import {handler} from './router/handler.js'

const ScopeSchema = z.enum(['engine', 'widget', 'all'])

const LevelModelSchema = z.object({level: LogLevelSchema.optional(), scope: ScopeSchema.optional()})

async function currentLevels(rpc: EngineClient): Promise<unknown> {
  const levels = await rpc.logs.level()
  const first = await levels.next()
  await levels.return()
  return first.value
}

function setLevel(rpc: EngineClient, level: LogLevel, scope: z.infer<typeof ScopeSchema>): Promise<unknown> {
  return rpc.logs.setLevel({level, scope})
}

const levelCommand = command(
  name('level'),
  description('Print the engine and widget log levels, or set them.'),
  argument(
    name('level'),
    description('off, error, warn, info, debug or trace; omit it to print the levels'),
    schema(LogLevelSchema.optional()),
  ),
  option(name('scope'), description('engine, widget or all (the default)'), schema(ScopeSchema.optional())),
  envelopeFlag,
  handler((model, target) => {
    const {level, scope} = LevelModelSchema.parse(model)
    return runRpc(target, (rpc) => (level === undefined ? currentLevels(rpc) : setLevel(rpc, level, scope ?? 'all')))
  }),
)

const EventLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])

const QueryModelSchema = z.object({
  level: EventLevelSchema.optional(),
  since: z.string().optional(),
  grep: z.string().optional(),
  follow: z.boolean(),
})

type QueryModel = z.infer<typeof QueryModelSchema>

async function followLogs(target: CliTarget, model: QueryModel): Promise<CliOutcome> {
  await runRpc(target, async (rpc) => {
    const level = model.level === undefined ? undefined : [model.level]
    for await (const event of await rpc.logs.tail({level})) process.stdout.write(`${JSON.stringify(event)}\n`)
  })
  return {report: 'none', code: 0}
}

function queryLogs(target: CliTarget, model: QueryModel): Promise<CliOutcome> {
  const level = model.level === undefined ? undefined : [model.level]
  return runRpc(target, (rpc) => rpc.logs.query({level, since: model.since, text: model.grep, limit: 200}))
}

const cleanupCommand = command(
  name('cleanup'),
  description('Delete the stored logs older than the retention (logRetention, 7d by default) now.'),
  envelopeFlag,
  handler((_model, target) => runRpc(target, (rpc) => rpc.logs.cleanup())),
)

export const logsRoute = command(
  name('logs'),
  description('Read the logs the conciv engine stored, newest first; switch or clean them with the subcommands.'),
  option(name('level'), description('only events at this level'), schema(EventLevelSchema.optional())),
  option(name('since'), description('only events at or after this ISO time'), schema(z.string().optional())),
  option(
    name('grep'),
    description('only events whose message or fields contain this text'),
    schema(z.string().optional()),
  ),
  toggle(name('follow'), description('print new events as JSON lines as they are stored, until stopped')),
  envelopeFlag,
  handler((model, target) => {
    const parsed = QueryModelSchema.parse(model)
    return parsed.follow ? followLogs(target, parsed) : queryLogs(target, parsed)
  }),
  levelCommand,
  cleanupCommand,
)
