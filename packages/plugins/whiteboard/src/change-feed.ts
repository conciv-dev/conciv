import type {Context} from '@conciv/plugin/experimental'
import {Deferred, Effect, FiberHandle, PubSub, Queue, Schedule, Schema, Stream} from 'effect'
import {z} from 'zod'
import {Whiteboard} from './rpc.js'
import {WhiteboardChangeFeedMachine} from './change-feed-machine.js'
import {makeMachineDriver} from './machine-driver.js'

export type ChangeMessage = {type: 'upsert' | 'delete'; key: string} | {type: 'reload'}
export type FeedEvent =
  | {readonly type: 'connected'}
  | {readonly type: 'changed'; readonly change: WhiteboardChangeFeedMachine.FeedChange}
type FeedSince = {readonly cursor: number; readonly changes: readonly WhiteboardChangeFeedMachine.FeedChange[]}

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
const FOLLOW_AGAIN = Schedule.spaced('1 second')

const failureMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

function followEvents<Event>(
  events: AsyncIterable<Event>,
  schedule: Schedule.Schedule<unknown>,
): Stream.Stream<Event, EventsStopped> {
  return Stream.fromAsyncIterable(events, (cause) => EventsStopped.make({message: failureMessage(cause)})).pipe(
    Stream.tapError((stopped) => Effect.logWarning('the change events failed; following them again', stopped.message)),
    Stream.retry(schedule),
    Stream.repeat(schedule),
  )
}

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
    events: followEvents(client.event.subscribe({types: ['rpc.whiteboard.changed']}), FOLLOW_AGAIN).pipe(
      Stream.mapEffect(decode),
      Stream.flattenIterable,
    ),
  }
}

export const makeChangeFeed = Effect.fn('whiteboard.changeFeed')(function* (
  source: ChangeSource,
  options: {retryMs: number},
) {
  const start = WhiteboardChangeFeedMachine.startChangeFeed()
  const inbox = yield* Queue.unbounded<WhiteboardChangeFeedMachine.ChangeFeedEvent>()
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
  const offer = (event: WhiteboardChangeFeedMachine.ChangeFeedEvent) => Queue.offer(inbox, event)

  const run = (effect: WhiteboardChangeFeedMachine.ChangeFeedEffect): Effect.Effect<unknown> => {
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

  const driver = yield* makeMachineDriver({
    initial: start.state,
    transition: WhiteboardChangeFeedMachine.transitionChangeFeed,
    run: (command: WhiteboardChangeFeedMachine.ChangeFeedEffect) => Effect.asVoid(run(command)),
  })

  yield* Effect.forEach(start.effects, run, {discard: true})
  yield* Queue.take(inbox).pipe(Effect.flatMap(driver.dispatch), Effect.forever, Effect.forkScoped)
  yield* Effect.addFinalizer(() => driver.dispatch({type: 'disposed'}))

  return {
    state: driver.state,
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
