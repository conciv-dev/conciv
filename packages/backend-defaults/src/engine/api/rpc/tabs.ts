import type {ContractedRouter} from '@orpc/server'
import {Effect, Result, Stream} from 'effect'
import type {contract} from '@conciv/protocol'
import type {RpcContext} from '@conciv/types/rpc-types'
import * as Tab from '@conciv/backend-app-api/core/tab'
import {os, type RpcDeps} from './mount.js'
import {relayEvents} from './relay-events.js'

export function tabsRouter(deps: RpcDeps): ContractedRouter<typeof contract.tabs, RpcContext> {
  const host = deps.pluginHost
  return {
    open: os.tabs.open.handler(async ({input, errors, signal}) => {
      const outcome = await host.runPromise(
        Tab.Service.use((tabs) => tabs.open(input)).pipe(Effect.scoped, Effect.result),
        {signal},
      )
      if (Result.isSuccess(outcome)) return outcome.success
      if (outcome.failure._tag === 'Session.NotFoundError') throw errors.NOT_FOUND()
      throw errors.UNAVAILABLE({message: outcome.failure.message})
    }),
    state: os.tabs.state.handler(async ({input, errors, signal}) => {
      const outcome = await host.runPromise(Tab.Service.use((tabs) => tabs.update(input)).pipe(Effect.result), {
        signal,
      })
      if (Result.isFailure(outcome)) throw errors.UNAVAILABLE({message: outcome.failure.message})
      return {ok: true as const}
    }),
    list: os.tabs.list.handler(({input, signal}) =>
      host.runPromise(
        Tab.Service.use((tabs) => tabs.list(input.sessionId)),
        {signal},
      ),
    ),
    sessions: os.tabs.sessions.handler(({signal}) =>
      host.runPromise(
        Tab.Service.use((tabs) => tabs.sessions()),
        {signal},
      ),
    ),
    changes: os.tabs.changes.handler(async ({signal}) => {
      const changes = Stream.unwrap(Tab.Service.use((tabs) => Effect.succeed(tabs.changes)))
      return relayEvents(Stream.toAsyncIterableWith(changes, await host.context())[Symbol.asyncIterator](), signal)
    }),
  }
}
