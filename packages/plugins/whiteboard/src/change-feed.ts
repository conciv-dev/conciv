import type {Context} from '@conciv/plugin/experimental'
import {Deferred, Effect, FiberHandle, PubSub, Queue, Schedule, Schema, Stream, SubscriptionRef} from 'effect'
import {z} from 'zod'
import {Whiteboard} from './rpc.js'
import {
  startChangeFeed,
  transitionChangeFeed,
  type ChangeFeedEffect,
  type ChangeFeedEvent,
  type ChangeFeedState,
  type FeedChange,
} from './change-feed-machine.js'

export type ChangeMessage = {type: 'upsert' | 'delete'; key: string} | {type: 'reload'}
export type FeedEvent = {readonly type: 'connected'} | {readonly type: 'changed'; readonly change: FeedChange}
type FeedSince = {readonly cursor: number; readonly changes: readonly FeedChange[]}

export const SinceFailed = Schema.TaggedStruct('SinceFailed', {message: Schema.String})
type SinceFailed = typeof SinceFailed.Type
export const EventsStopped = Schema.TaggedStruct('EventsStopped', {message: Schema.String})
type EventsStopped = typeof EventsStopped.Type

type ChangeSource = {
  readonly since: (cursor: number) => Effect.Effect<FeedSince, SinceFailed>
  readonly events: Stream.Stream<FeedEvent, EventsStopped>
}

type Routed = {readonly table: string | undefined; readonly message: ChangeMessage}

const ChangedEvent = z.object({
  type: z.literal('rpc.whiteboard.changed'),
  data: z.object({
    room: z.string(),
    table: z.string(),
    key: z.string(),
    type: z.enum(['upsert', 'delete']),
    cursor: z.number(),
  }),
})

const LATEST = Number.MAX_SAFE_INTEGER
const RETRY_MAX_WAIT_MS = 10_000

const failureMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

export function rpcChangeSource(client: Context['client'], room: string): ChangeSource {
  const whiteboard = client.rpc(Whiteboard)
  const decode = (event: {type: string}): Effect.Effect<readonly FeedEvent[]> => {
    if (event.type === 'server.connected') return Effect.succeed([{type: 'connected'}])
    const parsed = ChangedEvent.safeParse(event)
    if (!parsed.success)
      return Effect.logWarning('a change event did not match its schema', parsed.error.message).pipe(Effect.as([]))
    if (parsed.data.data.room !== room) return Effect.succeed([])
    return Effect.succeed([{type: 'changed', change: parsed.data.data}])
  }
  return {
    since: (cursor) =>
      Effect.tryPromise({
        try: (signal) => whiteboard.since({room, cursor}, {signal}),
        catch: (cause) => SinceFailed.make({message: failureMessage(cause)}),
      }),
    events: Stream.unwrap(
      Effect.sync(() =>
        Stream.fromAsyncIterable(client.event.subscribe({types: ['rpc.whiteboard.changed']}), (cause) =>
          EventsStopped.make({message: failureMessage(cause)}),
        ),
      ),
    ).pipe(Stream.mapEffect(decode), Stream.flattenIterable),
  }
}

export const makeChangeFeed = Effect.fn('whiteboard.changeFeed')(function* (
  source: ChangeSource,
  options: {retryMs: number},
) {
  const start = startChangeFeed()
  const state = yield* SubscriptionRef.make<ChangeFeedState>(start.state)
  const inbox = yield* Queue.unbounded<ChangeFeedEvent>()
  const routed = yield* PubSub.unbounded<Routed>()
  const opened = yield* Deferred.make<void>()
  const reads = yield* FiberHandle.make()
  const follow = yield* FiberHandle.make()

  const retry = Schedule.min([Schedule.exponential(options.retryMs), Schedule.spaced(RETRY_MAX_WAIT_MS)]).pipe(
    Schedule.jittered,
  )
  const since = (cursor: number) =>
    source.since(cursor).pipe(
      Effect.tapError((failure) => Effect.logWarning('the change feed could not be read; retrying', failure.message)),
      Effect.retry(retry),
    )
  const offer = (event: ChangeFeedEvent) => Queue.offer(inbox, event)

  const run = (effect: ChangeFeedEffect): Effect.Effect<unknown> => {
    if (effect.type === 'readPosition')
      return FiberHandle.run(
        reads,
        since(LATEST).pipe(
          Effect.flatMap((read) => offer({type: 'positionRead', attempt: effect.attempt, cursor: read.cursor})),
        ),
      )
    if (effect.type === 'readSince')
      return FiberHandle.run(
        reads,
        since(effect.cursor).pipe(
          Effect.flatMap((read) => offer({type: 'sinceRead', attempt: effect.attempt, changes: read.changes})),
        ),
      )
    if (effect.type === 'route')
      return PubSub.publishAll(
        routed,
        effect.changes.map((change) => ({table: change.table, message: {type: change.type, key: change.key}})),
      )
    if (effect.type === 'reload') return PubSub.publish(routed, {table: undefined, message: {type: 'reload'}})
    if (effect.type === 'opened') return Deferred.succeed(opened, undefined)
    return FiberHandle.run(
      follow,
      source.events.pipe(
        Stream.runForEach(offer),
        Effect.catch((stopped) =>
          Effect.logWarning('the change events stopped; reloading the tables', stopped.message),
        ),
        Effect.andThen(offer({type: 'streamStopped'})),
      ),
    )
  }

  const step = (event: ChangeFeedEvent) =>
    SubscriptionRef.modify(state, (current) => {
      const next = transitionChangeFeed(current, event)
      return [next.effects, next.state]
    }).pipe(Effect.flatMap((effects) => Effect.forEach(effects, run, {discard: true})))

  yield* Effect.forEach(start.effects, run, {discard: true})
  yield* Queue.take(inbox).pipe(Effect.flatMap(step), Effect.forever, Effect.forkScoped)
  yield* Effect.addFinalizer(() => step({type: 'disposed'}))

  return {
    state,
    opened: Deferred.await(opened),
    follow: (table: string) =>
      PubSub.subscribe(routed).pipe(
        Effect.map((subscription) =>
          Stream.fromSubscription(subscription).pipe(
            Stream.filter((item) => item.table === undefined || item.table === table),
            Stream.map((item) => item.message),
          ),
        ),
      ),
  }
})

export type ChangeFeed = Effect.Success<ReturnType<typeof makeChangeFeed>>
