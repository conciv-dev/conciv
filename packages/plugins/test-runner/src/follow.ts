import {Data, Effect, Fiber, FiberHandle, Ref, Semaphore, Stream, SubscriptionRef} from 'effect'
import {from, onCleanup, type Accessor} from 'solid-js'
import type {Context} from '@conciv/plugin/experimental'
import {TestRunner} from './rpc.js'
import {TestEventSchema} from './events.js'
import {createFollowState, transitionFollow, type FollowEffect, type FollowEvent} from './follow-machine.js'
import {initialRunView, transitionRunView, type RunView} from './run-state.js'

type Client = Context['client']

const ReadFailed = Data.TaggedError('ReadFailed')<{readonly cause: unknown}>

const StreamFailed = Data.TaggedError('StreamFailed')<{readonly cause: unknown}>

const TEST_EVENT = 'rpc.test-runner.event'

function readRun(client: Client) {
  return Effect.tryPromise({
    try: async (signal) => {
      const runner = client.rpc(TestRunner)
      const status = await runner.status(undefined, {signal})
      const current = await runner.current(undefined, {signal})
      return {status, current}
    },
    catch: (cause) => new ReadFailed({cause}),
  })
}

function decodeEvent(event: {readonly type: string; readonly data?: unknown}): FollowEvent {
  if (event.type === 'server.connected') return {type: 'server-connected'}
  const parsed = TestEventSchema.safeParse(event.data)
  return parsed.success ? {type: 'event', event: parsed.data} : {type: 'event-invalid', error: parsed.error}
}

const followTestRun = Effect.fn('TestRunner.follow')(function* (
  client: Client,
  view: SubscriptionRef.SubscriptionRef<RunView>,
) {
  const state = yield* Ref.make(createFollowState())
  const reads = yield* FiberHandle.make<void, never>()
  const transitions = yield* Semaphore.make(1)

  const read = (attempt: number): Effect.Effect<void> =>
    readRun(client).pipe(
      Effect.matchEffect({
        onSuccess: ({status, current}) => dispatch({type: 'read-done', attempt, status, current}),
        onFailure: (error) => dispatch({type: 'read-failed', attempt, error: error.cause}),
      }),
    )

  const perform = (effect: FollowEffect): Effect.Effect<void> => {
    if (effect.type === 'apply')
      return SubscriptionRef.update(view, (current) => transitionRunView(current, effect.action))
    if (effect.type === 'log')
      return Effect.logError(effect.message).pipe(Effect.annotateLogs({plugin: 'test-runner', cause: effect.error}))
    return FiberHandle.run(reads, read(effect.attempt)).pipe(Effect.asVoid)
  }

  const dispatch = (event: FollowEvent): Effect.Effect<void> =>
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const effects = yield* Ref.modify(state, (current) => {
          const next = transitionFollow(current, event)
          return [next.effects, next.state]
        })
        yield* Effect.forEach(effects, perform, {discard: true})
      }),
    )

  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}))

  yield* Stream.fromAsyncIterable(
    client.event.subscribe({types: [TEST_EVENT]}),
    (cause) => new StreamFailed({cause}),
  ).pipe(
    Stream.runForEach((event) => dispatch(decodeEvent(event))),
    Effect.catch((error) => dispatch({type: 'stream-failed', error: error.cause})),
  )
})

function fromRef(ref: SubscriptionRef.SubscriptionRef<RunView>): Accessor<RunView> {
  return from<RunView>((set) => {
    const fiber = Effect.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => set(value))),
    )
    return () => void Effect.runFork(Fiber.interrupt(fiber))
  }, initialRunView)
}

export function followRunView(client: Client): Accessor<RunView> {
  const view = Effect.runSync(SubscriptionRef.make(initialRunView))
  const fiber = Effect.runFork(Effect.scoped(followTestRun(client, view)))
  onCleanup(() => void Effect.runFork(Fiber.interrupt(fiber)))
  return fromRef(view)
}
