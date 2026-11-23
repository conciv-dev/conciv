import type {z} from 'zod'
import {Effect} from 'effect'
import {Bus, Rpc, Session, SessionSchema} from '@conciv/plugin-host'
import {Definition} from '@conciv/plugin-page/rpc'
import type {SessionId} from '@conciv/protocol/chat-types'
import {queueNotice} from '@conciv/contract'
import type {PageQueueHandle, PageQueueProgress, PageQueueResult} from '@conciv/protocol/page-types'
import type {PluginHost} from '../api/rpc/mount.js'
import {orNone, type PageReader} from './page-rpc.js'

type Methods = typeof Definition.methods

type Input<Name extends keyof Methods> = z.input<Methods[Name]['input']>

export type PagePlugin = ReturnType<typeof makePagePlugin>

const QUEUE_FINISHED = `rpc.${Definition.id}.queue.finished`

export function makePagePlugin(host: () => PluginHost, reader: PageReader) {
  const inFlightHubCalls = new Map<SessionId, Set<string>>()
  const heldHubCalls = new Map<SessionId, Set<string>>()
  const {call, log} = reader

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
      log,
    )

  const holding = async (sessionId: SessionId, callIds: readonly string[]): Promise<Set<string>> => {
    const finished = Definition.methods['queue.owed'].output.parse(await call('queue.owed', {sessionId}))
    const playing = await Promise.all(
      callIds.map(async (callId) => ((await startedBy(sessionId, [callId])).length > 0 ? [callId] : [])),
    )
    const owedBy = new Set(finished.map((queue) => queue.toolCallId))
    return new Set([...playing.flat(), ...callIds.filter((callId) => owedBy.has(callId))])
  }

  return {
    queueWait: async (
      input: Input<'queue.wait'>,
      signal?: AbortSignal,
      replied?: Promise<boolean>,
    ): Promise<PageQueueResult | PageQueueProgress> => {
      if (replied === undefined)
        return Definition.methods['queue.wait'].output.parse(await call('queue.wait', input, signal))
      const handed = Definition.methods['queue.claim'].output.parse(await call('queue.claim', input, signal))
      if (!('result' in handed)) return handed
      const {before} = handed
      if (before !== null)
        void replied
          .catch(() => false)
          .then((sent) =>
            call('queue.settle', {
              sessionId: input.sessionId,
              queueIds: [input.queueId],
              delivery: sent ? 'delivered' : before,
            }),
          )
          .catch((error: unknown) =>
            log(
              Effect.logError('[core] a queue handed to a waiter could not be settled', {
                sessionId: input.sessionId,
                queueId: input.queueId,
                error,
              }),
            ),
          )
      return handed.result
    },
    startedBy,
    hubFinished: async (sessionId: SessionId): Promise<PageQueueResult[]> =>
      orNone(
        call('queue.undelivered', {sessionId, toolCallIds: hubCalls(sessionId)}).then((finished) =>
          Definition.methods['queue.undelivered'].output.parse(finished),
        ),
        `the finished hub queues of ${sessionId}`,
        log,
      ),
    hubCall: (sessionId: SessionId, callId: string): void => {
      const known = inFlightHubCalls.get(sessionId) ?? new Set<string>()
      inFlightHubCalls.set(sessionId, known.add(callId))
    },
    hubReplied: async (sessionId: SessionId, callIds: ReadonlySet<string>): Promise<void> => {
      const candidates = [...callIds, ...(heldHubCalls.get(sessionId) ?? [])]
      const held = await holding(sessionId, candidates).catch((error: unknown) => {
        log(Effect.logError('[core] the hub queues could not be read; they stay hub work', {sessionId, error}))
        return new Set(candidates)
      })
      if (held.size > 0) heldHubCalls.set(sessionId, held)
      else heldHubCalls.delete(sessionId)
      const inFlight = inFlightHubCalls.get(sessionId)
      callIds.forEach((callId) => inFlight?.delete(callId))
      if (inFlight?.size === 0) inFlightHubCalls.delete(sessionId)
    },
    deliverFinished: () =>
      host().runPromise(
        Effect.gen(function* () {
          const bus = yield* Bus.Service
          const rpc = yield* Rpc.Service
          const sessions = yield* Session.Service
          const delivered = (sessionId: SessionId, result: PageQueueResult) =>
            sessions
              .synthetic({
                sessionID: SessionSchema.Id.make(sessionId),
                text: queueNotice(result),
                description: `Queued page actions ${result.status}`,
                metadata: {source: 'page-queue', queueId: result.queueId, state: result.status},
              })
              .pipe(Effect.catchTag('Session.NotFoundError', () => Effect.void))
          const deliver = ({sessionId, toolCallId}: {sessionId: SessionId; toolCallId: string}) =>
            rpc.call(Definition.id, 'queue.undelivered', {sessionId, toolCallIds: [toolCallId]}).pipe(
              Effect.map((listed) => Definition.methods['queue.undelivered'].output.parse(listed)),
              Effect.flatMap((results) =>
                Effect.forEach(results, (result) => delivered(sessionId, result), {discard: true}),
              ),
              Effect.catchCause((cause) =>
                Effect.logError('[core] a finished page queue could not reach its session', {sessionId, cause}),
              ),
            )
          return yield* bus.listen((event) => {
            if (event.type !== QUEUE_FINISHED) return Effect.void
            const finished = Definition.events['queue.finished'].schema.safeParse(event.data)
            if (!finished.success)
              return Effect.logError('[core] a page queue.finished event could not be read', {error: finished.error})
            if (hubCalls(finished.data.sessionId).includes(finished.data.toolCallId)) return Effect.void
            return deliver(finished.data)
          })
        }),
      ),
  }
}
