import type {ContractedRouter} from '@orpc/server'
import {Effect, Stream} from 'effect'
import type {contract} from '@conciv/protocol'
import * as Tab from '@conciv/backend-app-api/core/tab'
import {os, type EngineRpcContext} from './mount.js'
import {relayEvents} from './relay-events.js'

export function tabsRouter(): ContractedRouter<typeof contract.tabs, EngineRpcContext> {
  return {
    open: os.tabs.open.effect(function* ({input}) {
      return yield* Tab.Service.use((tabs) => tabs.open(input)).pipe(Effect.scoped)
    }),
    state: os.tabs.state.effect(function* ({input}) {
      yield* Tab.Service.use((tabs) => tabs.update(input))
      return {ok: true as const}
    }),
    list: os.tabs.list.effect(function* ({input}) {
      return yield* Tab.Service.use((tabs) => tabs.list(input.sessionId))
    }),
    sessions: os.tabs.sessions.effect(function* () {
      return yield* Tab.Service.use((tabs) => tabs.sessions())
    }),
    changes: os.tabs.changes.effect(function* ({signal}) {
      const changes = yield* Stream.toAsyncIterableEffect(
        Stream.unwrap(Tab.Service.use((tabs) => Effect.succeed(tabs.changes))),
      )
      return relayEvents(changes[Symbol.asyncIterator](), signal)
    }),
  }
}
