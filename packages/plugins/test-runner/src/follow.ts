import {Effect, Fiber, FiberHandle, Ref, Schema, Semaphore, Stream, SubscriptionRef} from 'effect'
import {onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import type {Context} from '@conciv/plugin/experimental'
import {TestRunner} from './rpc.js'
import {TestEventSchema} from './events.js'
import {createFollowState, transitionFollow, type FollowEffect, type FollowEvent} from './follow-machine.js'
import {initialRunView, transitionRunView, type RunView} from './run-state.js'

type Client = Context['client']

const ReadFailed = Schema.TaggedStruct('TestRunner.ReadFailed', {cause: Schema.Defect()})
type ReadFailed = typeof ReadFailed.Type & globalThis.Error
const makeReadFailed = (fields: Omit<typeof ReadFailed.Type, '_tag'>): ReadFailed =>
  Object.assign(new globalThis.Error(), ReadFailed.make(fields), {name: 'TestRunner.ReadFailed'})

const StreamFailed = Schema.TaggedStruct('TestRunner.StreamFailed', {cause: Schema.Defect()})
type StreamFailed = typeof StreamFailed.Type & globalThis.Error
const makeStreamFailed = (fields: Omit<typeof StreamFailed.Type, '_tag'>): StreamFailed =>
  Object.assign(new globalThis.Error(), StreamFailed.make(fields), {name: 'TestRunner.StreamFailed'})

const TEST_EVENT = 'rpc.test-runner.event'

function readRun(client: Client) {
  return Effect.tryPromise({
    try: async (signal) => {
      const runner = client.rpc(TestRunner)
      const status = await runner.status(undefined, {signal})
      const current = await runner.current(undefined, {signal})
      return {status, current}
    },
    catch: (cause) => makeReadFailed({cause}),
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

  yield* Stream.fromAsyncIterable(client.event.subscribe({types: [TEST_EVENT]}), (cause) =>
    makeStreamFailed({cause}),
  ).pipe(
    Stream.runForEach((event) => dispatch(decodeEvent(event))),
    Effect.catch((error) => dispatch({type: 'stream-failed', error: error.cause})),
  )
})

function fromRef(ref: SubscriptionRef.SubscriptionRef<RunView>): Accessor<RunView> {
  const [store, setStore] = createStore<{view: RunView}>({view: initialRunView})
  const fiber = Effect.runFork(
    Stream.runForEach(SubscriptionRef.changes(ref), (value) =>
      Effect.sync(() => setStore('view', reconcile(value, {key: 'id'}))),
    ),
  )
  onCleanup(() => void Effect.runFork(Fiber.interrupt(fiber)))
  return () => store.view
}

export function followRunView(client: Client): Accessor<RunView> {
  const view = Effect.runSync(SubscriptionRef.make(initialRunView))
  const fiber = Effect.runFork(Effect.scoped(followTestRun(client, view)))
  onCleanup(() => void Effect.runFork(Fiber.interrupt(fiber)))
  return fromRef(view)
}
