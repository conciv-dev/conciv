import type {Router} from '@orpc/server'
import {Effect, Stream} from 'effect'
import type {contract} from '@conciv/protocol'
import type {RpcContext} from '@conciv/types/rpc-types'
import * as LogLevel from '../../../util/observability/log-level.js'
import * as LogStore from '../../../util/observability/log-store.js'
import {os, type RpcDeps} from './mount.js'
import {relayEvents} from './relay-events.js'

export function logsRouter(deps: RpcDeps): Router<typeof contract.logs, RpcContext> {
  const host = deps.pluginHost
  return {
    level: os.logs.level.handler(async ({signal}) => {
      const changes = Stream.unwrap(
        Effect.gen(function* () {
          const levels = yield* LogLevel.Service
          const store = yield* LogStore.Service
          return levels.changes.pipe(Stream.map((current) => ({...current, dropped: store.dropped()})))
        }),
      )
      return relayEvents(Stream.toAsyncIterableWith(changes, await host.context())[Symbol.asyncIterator](), signal)
    }),
    setLevel: os.logs.setLevel.handler(({input, signal}) =>
      host.runPromise(
        Effect.gen(function* () {
          const levels = yield* LogLevel.Service
          const store = yield* LogStore.Service
          yield* levels.set(input.level, input.scope)
          return {...(yield* levels.get), dropped: store.dropped()}
        }),
        {signal},
      ),
    ),
    write: os.logs.write.handler(async ({input, signal}) => {
      await host.runPromise(Effect.forEach(input.events, writeClientEvent, {discard: true}), {signal})
      return {ok: true as const}
    }),
    query: os.logs.query.handler(({input, signal}) =>
      host.runPromise(
        Effect.gen(function* () {
          const {engine, widget} = yield* LogLevel.Service.use((levels) => levels.get)
          if (engine === 'off' && widget === 'off') return {level: engine, events: []}
          const events = yield* LogStore.Service.use((store) => store.query(input))
          return {level: engine, events: [...events]}
        }),
        {signal},
      ),
    ),
    tail: os.logs.tail.handler(async ({input, signal}) => {
      const rows = Stream.unwrap(LogStore.Service.use((store) => Effect.succeed(store.tail))).pipe(
        Stream.filter(
          (row) =>
            (input.source === undefined || row.source === input.source) &&
            (input.level === undefined || input.level.some((level) => level === row.level)),
        ),
      )
      return relayEvents(Stream.toAsyncIterableWith(rows, await host.context())[Symbol.asyncIterator](), signal)
    }),
    cleanup: os.logs.cleanup.handler(({signal}) =>
      host.runPromise(
        LogStore.Service.use((store) => store.cleanup),
        {signal},
      ),
    ),
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
