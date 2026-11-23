import {z} from 'zod'
import {Effect} from 'effect'
import {Plugin, Rpc} from '@conciv/plugin-host'
import {Definition, State} from '@conciv/plugin-page/rpc'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PluginHost} from '../api/rpc/mount.js'
import {logOnRuntime, type Log} from '../lib/logging.js'

export type PageReader = ReturnType<typeof makePageReader>

const NO_TABS: State = {tabs: [], focusedTabId: null}

const Unavailable = z.object({type: z.literal('rpc.unavailable')})

export function unlisted(error: unknown): boolean {
  return error instanceof Error && Unavailable.safeParse(error.cause).success
}

export async function orNone<Value>(work: Promise<Value[]>, what: string, log: Log): Promise<Value[]> {
  return work.catch((error: unknown) => {
    if (!unlisted(error)) log(Effect.logError('[core] the page plugin could not be read', {what, error}))
    return []
  })
}

export function makePageReader(host: () => PluginHost) {
  const log: Log = (entry) => logOnRuntime(host())(entry)

  const call = (method: keyof typeof Definition.methods, input: unknown, signal?: AbortSignal) =>
    host().runPromise(
      Plugin.awaitActivation.pipe(
        Effect.andThen(Rpc.Service.use((rpc) => rpc.call(Definition.id, method, input))),
        Effect.mapError((failure) => new Error(failure.message, {cause: failure})),
      ),
      signal === undefined ? {} : {signal},
    )

  return {
    call,
    log,
    tabs: async (sessionId: SessionId): Promise<State> => {
      try {
        return Definition.methods['tabs.list'].output.parse(await call('tabs.list', {sessionId}))
      } catch (error) {
        if (!unlisted(error)) log(Effect.logError('[core] the page tabs could not be read', {sessionId, error}))
        return NO_TABS
      }
    },
  }
}
