import {z} from 'zod'
import {Effect} from 'effect'
import {Bus, Rpc} from '@conciv/plugin-host'
import {Definition, State} from '@conciv/plugin-page/rpc'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PageQueueHandle, PageQueueResult} from '@conciv/protocol/page-types'
import type {PluginHost} from '../api/rpc/mount.js'
import {logError} from '../lib/debug.js'
import type {OwedQueue, QueueDelivery} from './page-queue.js'

type Methods = typeof Definition.methods

type Input<Name extends keyof Methods> = z.input<Methods[Name]['input']>

export type QueueFinished = z.infer<(typeof Definition.events)['queue.finished']['schema']>

export type PagePlugin = ReturnType<typeof makePagePlugin>

const QUEUE_FINISHED = `rpc.${Definition.id}.queue.finished`

const NO_TABS: State = {tabs: [], focusedTabId: null}

const Unavailable = z.object({type: z.literal('rpc.unavailable')})

function unlisted(error: unknown): boolean {
  return error instanceof Error && Unavailable.safeParse(error.cause).success
}

async function orNone<Value>(work: Promise<Value[]>, what: string): Promise<Value[]> {
  return work.catch((error: unknown) => {
    if (!unlisted(error)) logError(`[core] ${what} could not be read from the page plugin: ${String(error)}`)
    return []
  })
}

export function makePagePlugin(host: () => PluginHost) {
  const inFlightHubCalls = new Map<SessionId, Set<string>>()
  const heldHubCalls = new Map<SessionId, Set<string>>()

  const call = (method: keyof Methods, input: unknown, signal?: AbortSignal) =>
    host().runPromise(
      Rpc.Service.use((rpc) => rpc.call(Definition.id, method, input)).pipe(
        Effect.mapError((failure) => new Error(failure.message, {cause: failure})),
      ),
      signal === undefined ? {} : {signal},
    )

  const hubCalls = (sessionId: SessionId): string[] => [
    ...(inFlightHubCalls.get(sessionId) ?? []),
    ...(heldHubCalls.get(sessionId) ?? []),
  ]

  const startedBy = async (sessionId: SessionId, toolCallIds: Iterable<string>): Promise<PageQueueHandle[]> =>
    orNone(
      call('queue.startedBy', {sessionId, toolCallIds: [...toolCallIds]}).then((started) =>
        Definition.methods['queue.startedBy'].output.parse(started),
      ),
      `the queues ${sessionId} started`,
    )

  const owed = async (sessionId: SessionId, claim: boolean): Promise<OwedQueue[]> =>
    orNone(
      call('queue.owed', {sessionId, excludeToolCallIds: hubCalls(sessionId), claim}).then((listed) =>
        Definition.methods['queue.owed'].output
          .parse(listed)
          .map(({queueId, result, before}) => ({queueId, result, before})),
      ),
      `the queue results owed to ${sessionId}`,
    )

  const holding = async (sessionId: SessionId, callIds: readonly string[]): Promise<Set<string>> => {
    const finished = Definition.methods['queue.owed'].output.parse(
      await call('queue.owed', {sessionId, excludeToolCallIds: [], claim: false}),
    )
    const playing = await Promise.all(
      callIds.map(async (callId) => ((await startedBy(sessionId, [callId])).length > 0 ? [callId] : [])),
    )
    const owedBy = new Set(finished.map((queue) => queue.toolCallId))
    return new Set([...playing.flat(), ...callIds.filter((callId) => owedBy.has(callId))])
  }

  const delivery: QueueDelivery = {
    owed,
    settle: async (sessionId, queueIds, settled) => {
      await call('queue.settle', {sessionId, queueIds, delivery: settled})
    },
  }

  return {
    hmrWait: async (input: Input<'hmr.wait'>, signal?: AbortSignal) =>
      Definition.methods['hmr.wait'].output.parse(await call('hmr.wait', input, signal)),
    queueWait: async (input: Input<'queue.wait'>, signal?: AbortSignal) =>
      Definition.methods['queue.wait'].output.parse(await call('queue.wait', input, signal)),
    tabs: async (sessionId: SessionId): Promise<State> => {
      try {
        return State.parse(await call('run', {sessionId, action: {type: 'tabs.list'}}))
      } catch (error) {
        if (!unlisted(error) && !String(error).includes('[page.disconnected]'))
          logError(`[core] the page tabs of ${sessionId} could not be read: ${String(error)}`)
        return NO_TABS
      }
    },
    attachedSessions: async (): Promise<SessionId[]> =>
      orNone(
        call('sessions.attached', {}).then((listed) => Definition.methods['sessions.attached'].output.parse(listed)),
        'the sessions with a page attached',
      ),
    delivery,
    startedBy,
    undelivered: async (sessionId: SessionId, hub: boolean): Promise<PageQueueResult[]> =>
      orNone(
        call(
          'queue.undelivered',
          hub ? {sessionId, toolCallIds: hubCalls(sessionId)} : {sessionId, excludeToolCallIds: hubCalls(sessionId)},
        ).then((finished) => Definition.methods['queue.undelivered'].output.parse(finished)),
        `the finished queues of ${sessionId}`,
      ),
    fromHub: (sessionId: SessionId, toolCallId: string): boolean => hubCalls(sessionId).includes(toolCallId),
    hubCall: (sessionId: SessionId, callId: string): void => {
      const known = inFlightHubCalls.get(sessionId) ?? new Set<string>()
      inFlightHubCalls.set(sessionId, known.add(callId))
    },
    hubReplied: async (sessionId: SessionId, callIds: ReadonlySet<string>): Promise<void> => {
      const candidates = [...callIds, ...(heldHubCalls.get(sessionId) ?? [])]
      const held = await holding(sessionId, candidates).catch((error: unknown) => {
        logError(`[core] the hub queues of ${sessionId} could not be read; they stay hub work: ${String(error)}`)
        return new Set(candidates)
      })
      if (held.size > 0) heldHubCalls.set(sessionId, held)
      else heldHubCalls.delete(sessionId)
      const inFlight = inFlightHubCalls.get(sessionId)
      callIds.forEach((callId) => inFlight?.delete(callId))
      if (inFlight?.size === 0) inFlightHubCalls.delete(sessionId)
    },
    release: (sessionId: SessionId): void => {
      inFlightHubCalls.delete(sessionId)
      heldHubCalls.delete(sessionId)
    },
    followFinished: (listener: (finished: QueueFinished) => void) =>
      host().runPromise(
        Effect.gen(function* () {
          const bus = yield* Bus.Service
          return yield* bus.listen((event) =>
            Effect.sync(() => {
              if (event.type !== QUEUE_FINISHED) return
              const finished = Definition.events['queue.finished'].schema.safeParse(event.data)
              if (finished.success) listener(finished.data)
              else logError(`[core] a page queue.finished event could not be read: ${finished.error.message}`)
            }),
          )
        }),
      ),
  }
}
