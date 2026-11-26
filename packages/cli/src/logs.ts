import {z} from 'zod'
import {argument, command, description, name, option, route, schema} from '@bomb.sh/router'
import {LogLevelSchema, type LogLevel} from '@conciv/types/config-types'
import type {EngineClient} from '@conciv/client'
import {envelopeFlag} from './envelope.js'
import {runRpc} from './request.js'
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

export const logsRoute = route(
  name('logs'),
  description('Read and switch the logs of the conciv engine and widget.'),
  envelopeFlag,
  levelCommand,
)
