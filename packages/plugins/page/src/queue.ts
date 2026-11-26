export * as PageQueue from './queue.js'
import {Clock, Deferred, Effect} from 'effect'
import {z} from 'zod'
import type {SessionId} from '@conciv/types/chat-types'
import {
  PAGE_QUEUE_REFUSED,
  PAGE_QUEUE_STOPPED,
  PAGE_QUEUE_SYNC_MS,
  type PageQueueHandle,
  type PageQueueResult,
  PageRaisedErrorSchema as Raised,
} from './page-types.js'
import type * as Tool from '@conciv/protocol/schema/tool'
import {
  createQueueState,
  findQueue,
  OWED_QUEUES,
  readOwing,
  readProgress,
  transitionQueue,
  type Landed,
  type QueueEntry,
  type QueueEvent,
  type Settled,
} from './queue-machine.js'
import {Action, type PageChangeEntry, type Result} from './rpc.js'

export type RequestSettlement =
  | {readonly ok: true; readonly result: Result}
  | {readonly ok: false; readonly error: Tool.Error; readonly tabClosed?: true}

type Queueing = Extract<Action, {readonly type: 'queue' | 'queue_async'}>

export type QueueStart = {agentId: string; action: Queueing; toolCallId: string; origin: Tool.Origin}

type Play = (
  sessionId: SessionId,
  play: {action: Action; agentId: string; queueId: string; actions: readonly Action[]},
) => Effect.Effect<readonly Deferred.Deferred<RequestSettlement>[], unknown>

const Unconfirmed = /^\[page\.(timeout|disconnected|tab_unavailable)\]/

const NotDispatched = /^\[page\.not_dispatched\]/

const Values = z.record(z.string(), z.unknown())

const Journaled = z.looseObject({tool: z.string(), ref: z.string().optional(), selector: z.string().optional()})

function playedOutcome(index: number, tool: string, settlement: RequestSettlement): Settled {
  if (settlement.ok) {
    const value = settlement.result.value
    const parsed = Values.safeParse(value)
    return {outcome: {index, tool, ok: true, result: parsed.success ? parsed.data : {value}}, landed: 'played'}
  }
  if (NotDispatched.test(settlement.error.message))
    return {outcome: {index, tool, ok: false, error: settlement.error.message}, landed: 'lost'}
  const raised = Raised.safeParse(settlement.error.error)
  const error = raised.success ? raised.data.message || settlement.error.message : settlement.error.message
  if (raised.success) return {outcome: {index, tool, ok: false, error}, landed: unplayedAs(raised.data.code)}
  const code = settlement.tabClosed === true ? 'disconnected' : Unconfirmed.exec(error)?.[1]
  if (code === undefined) return {outcome: {index, tool, ok: false, error}, landed: 'played'}
  return {outcome: {index, tool, ok: false, error: unconfirmedError(code, tool)}, landed: 'lost'}
}

function unconfirmedError(code: string, tool: string): string {
  if (code === 'timeout') return `the page did not confirm ${tool} in time; it may already have run`
  return `the page reloaded or closed during ${tool}; it may already have run`
}

function unplayedAs(code: string): Landed {
  if (code === PAGE_QUEUE_STOPPED) return 'stopped'
  if (code === PAGE_QUEUE_REFUSED) return 'lost'
  return 'played'
}

function toAction(queued: {tool: string}): Action {
  const {tool, ...input} = queued
  return Action.parse({...input, type: tool.replace(/^page_/, '')})
}

export const makeQueues = Effect.fn('PageQueue.makeQueues')(function* (deps: {
  play: Play
  journal: (sessionId: SessionId, change: Omit<PageChangeEntry, 'seq'>) => Effect.Effect<void, unknown>
  started: (entry: QueueEntry) => Effect.Effect<void>
  delivered: (queueId: string) => Effect.Effect<void>
  finished: (entry: QueueEntry) => Effect.Effect<void>
  syncMs?: number
}) {
  const scope = yield* Effect.scope
  const machine = {state: createQueueState()}

  const dispatch = (event: QueueEvent): Effect.Effect<void> =>
    Effect.suspend(() => {
      const next = transitionQueue(machine.state, event)
      machine.state = next.state
      return Effect.forEach(
        next.effects,
        (effect) =>
          effect.type === 'resolve'
            ? Deferred.succeed(effect.entry.done, effect.result)
            : deps
                .finished(effect.entry)
                .pipe(
                  Effect.catchCause((cause) =>
                    Effect.logWarning(`Delivering queue ${effect.entry.queueId} failed`, cause),
                  ),
                ),
        {discard: true},
      )
    })

  const journaled = (entry: QueueEntry, index: number, queued: {tool: string}) =>
    Effect.gen(function* () {
      const {tool, ref, selector, ...args} = Journaled.parse(queued)
      const ts = yield* Clock.currentTimeMillis
      yield* deps.journal(entry.sessionId, {
        ts,
        verb: tool,
        ...(ref === undefined ? {} : {ref}),
        ...(selector === undefined ? {} : {selector}),
        args,
      })
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning(`Journaling queued action ${index} of ${entry.queueId} failed`, cause),
      ),
    )

  const land = (entry: QueueEntry, index: number, queued: {tool: string} | undefined, settlement: RequestSettlement) =>
    dispatch({
      type: 'landed',
      queueId: entry.queueId,
      index,
      settled: playedOutcome(index, queued?.tool ?? '', settlement),
    }).pipe(Effect.andThen(settlement.ok && queued !== undefined ? journaled(entry, index, queued) : Effect.void))

  const start = Effect.fn('PageQueue.start')(function* (sessionId: SessionId, given: QueueStart) {
    const actions = given.action.actions
    if (readOwing(machine.state) >= OWED_QUEUES)
      return yield* Effect.fail(
        new Error(`${OWED_QUEUES} queue results are still undelivered; collect them before queueing more`),
      )
    const queueId = `q_${crypto.randomUUID()}`
    const parsed = yield* Effect.try({
      try: () => ({action: Action.parse({...given.action, type: 'queue'}), actions: actions.map(toAction)}),
      catch: (error) => error,
    })
    const played = yield* deps.play(sessionId, {...parsed, agentId: given.agentId, queueId})
    const entry: QueueEntry = {
      queueId,
      sessionId,
      toolCallId: given.toolCallId,
      origin: given.origin,
      tools: actions.map((action) => action.tool),
      settled: actions.map(() => undefined),
      result: null,
      delivery: 'owed',
      done: yield* Deferred.make<PageQueueResult>(),
    }
    yield* dispatch({type: 'started', entry})
    yield* deps
      .started(entry)
      .pipe(Effect.catchCause((cause) => Effect.logWarning(`Announcing queue ${queueId} failed`, cause)))
    yield* Effect.forEach(
      played,
      (reply, index) =>
        Deferred.await(reply).pipe(Effect.flatMap((settlement) => land(entry, index, actions[index], settlement))),
      {concurrency: 'unbounded', discard: true},
    ).pipe(
      Effect.andThen(dispatch({type: 'finished', queueId})),
      Effect.andThen(Effect.sleep(0)),
      Effect.andThen(dispatch({type: 'announce', queueId})),
      Effect.forkIn(scope),
    )
    const handle: PageQueueHandle = {queueId, actions: actions.length}
    return handle
  })

  const reached = Effect.fn('PageQueue.reached')(function* (sessionId: SessionId, queueId: string, waitMs: number) {
    const entry = findQueue(machine.state, sessionId, queueId)
    if (entry === undefined) return yield* Effect.fail(new Error(`no queue ${queueId} on this tab`))
    if (entry.result === null && waitMs > 0) yield* Deferred.await(entry.done).pipe(Effect.timeoutOption(waitMs))
    return findQueue(machine.state, sessionId, queueId) ?? entry
  })

  const claim = Effect.fn('PageQueue.claim')(function* (sessionId: SessionId, queueId: string, waitMs: number) {
    const entry = yield* reached(sessionId, queueId, waitMs)
    return entry.result ?? readProgress(entry)
  })

  const settle = (sessionId: SessionId, queueIds: readonly string[]) =>
    Effect.suspend(() =>
      dispatch({
        type: 'delivered',
        queueIds: queueIds.filter((queueId) => findQueue(machine.state, sessionId, queueId) !== undefined),
      }),
    )

  const wait = Effect.fn('PageQueue.wait')(function* (sessionId: SessionId, queueId: string, waitMs: number) {
    const claimed = yield* claim(sessionId, queueId, waitMs)
    if (claimed.status === 'playing') return claimed
    yield* settle(sessionId, [queueId])
    yield* deps
      .delivered(queueId)
      .pipe(Effect.catchCause((cause) => Effect.logWarning(`Reporting queue ${queueId} failed`, cause)))
    return claimed
  })

  const play = (sessionId: SessionId, given: QueueStart) =>
    start(sessionId, given).pipe(
      Effect.flatMap(({queueId}) => wait(sessionId, queueId, deps.syncMs ?? PAGE_QUEUE_SYNC_MS)),
    )

  const cancelSession = (sessionId: SessionId) => dispatch({type: 'session.cancelled', sessionId})

  return {start, play, wait, settle, cancelSession}
})

export type Queues = Effect.Success<ReturnType<typeof makeQueues>>
