import type {ContractedRouter} from '@orpc/server'
import {Effect, Stream} from 'effect'
import type {contract} from '@conciv/protocol'
import * as LogLevel from '../../../util/observability/log-level.js'
import * as LogStore from '../../../util/observability/log-store.js'
import {logAtLevel, type LogLevel as Level} from '../../../util/observability/host-sink.js'
import {os, type EngineRpcContext} from './mount.js'
import {relayEvents} from './relay-events.js'

export function logsRouter(): ContractedRouter<typeof contract.logs, EngineRpcContext> {
  return {
    level: os.logs.level.effect(function* ({signal}) {
      const changes = yield* Stream.toAsyncIterableEffect(
        Stream.unwrap(
          Effect.gen(function* () {
            const levels = yield* LogLevel.Service
            const store = yield* LogStore.Service
            return levels.changes.pipe(Stream.map((current) => ({...current, dropped: store.dropped()})))
          }),
        ),
      )
      return relayEvents(changes[Symbol.asyncIterator](), signal)
    }),
    setLevel: os.logs.setLevel.effect(function* ({input}) {
      const levels = yield* LogLevel.Service
      const store = yield* LogStore.Service
      yield* levels.set(input.level, input.scope)
      return {...(yield* levels.get), dropped: store.dropped()}
    }),
    write: os.logs.write.effect(function* ({input}) {
      yield* Effect.forEach(input.events, writeClientEvent, {discard: true})
      return {ok: true as const}
    }),
    query: os.logs.query.effect(function* ({input}) {
      const {engine, widget} = yield* LogLevel.Service.use((levels) => levels.get)
      if (engine === 'off' && widget === 'off') return {level: engine, events: []}
      const events = yield* LogStore.Service.use((store) => store.query(input))
      return {level: engine, events: [...events]}
    }),
    tail: os.logs.tail.effect(function* ({input, signal}) {
      const rows = yield* Stream.toAsyncIterableEffect(
        Stream.unwrap(LogStore.Service.use((store) => Effect.succeed(store.tail))).pipe(
          Stream.filter(
            (row) =>
              (input.source === undefined || row.source === input.source) &&
              (input.level === undefined || input.level.some((level) => level === row.level)),
          ),
        ),
      )
      return relayEvents(rows[Symbol.asyncIterator](), signal)
    }),
    cleanup: os.logs.cleanup.effect(function* () {
      return yield* LogStore.Service.use((store) => store.cleanup)
    }),
  }
}

function writeClientEvent(event: {
  readonly level: Level
  readonly timestamp: string
  readonly service: string
  readonly fields: Readonly<Record<string, unknown>>
}) {
  const {message, ...fields} = event.fields
  return logAtLevel(event.level, typeof message === 'string' ? message : '[client] log event').pipe(
    Effect.annotateLogs({...fields, source: 'client', service: event.service, clientTimestamp: event.timestamp}),
  )
}
