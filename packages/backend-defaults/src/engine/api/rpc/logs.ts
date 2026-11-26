import type {Router} from '@orpc/server'
import {Effect, Stream} from 'effect'
import type {contract} from '@conciv/protocol'
import type {RpcContext} from '@conciv/types/rpc-types'
import * as LogLevel from '../../../util/observability/log-level.js'
import {os, type RpcDeps} from './mount.js'
import {relayEvents} from './relay-events.js'

export function logsRouter(deps: RpcDeps): Router<typeof contract.logs, RpcContext> {
  const host = deps.pluginHost
  return {
    level: os.logs.level.handler(async ({signal}) => {
      const changes = Stream.unwrap(LogLevel.Service.use((levels) => Effect.succeed(levels.changes)))
      return relayEvents(Stream.toAsyncIterableWith(changes, await host.context())[Symbol.asyncIterator](), signal)
    }),
    setLevel: os.logs.setLevel.handler(({input, signal}) =>
      host.runPromise(
        LogLevel.Service.use((levels) => levels.set(input.level, input.scope).pipe(Effect.andThen(levels.get))),
        {signal},
      ),
    ),
    write: os.logs.write.handler(async ({input, signal}) => {
      await host.runPromise(Effect.forEach(input.events, writeClientEvent, {discard: true}), {signal})
      return {ok: true as const}
    }),
  }
}

const severities = {
  trace: 'Trace',
  debug: 'Debug',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
  fatal: 'Fatal',
} as const

function writeClientEvent(event: {
  readonly level: keyof typeof severities
  readonly timestamp: string
  readonly service: string
  readonly fields: Readonly<Record<string, unknown>>
}) {
  const {message, ...fields} = event.fields
  return Effect.logWithLevel(severities[event.level])(
    typeof message === 'string' ? message : '[client] log event',
  ).pipe(Effect.annotateLogs({...fields, source: 'client', service: event.service, clientTimestamp: event.timestamp}))
}
