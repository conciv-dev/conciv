import {Effect, Fiber, FiberHandle, Ref, Semaphore, Stream, SubscriptionRef, type ManagedRuntime} from 'effect'
import {onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import type {Context} from '@conciv/frontend-plugin-api'
import {TestRunner} from './rpc.js'
import {TestEventSchema} from './events.js'
import {TestRunnerFollowMachine} from './follow-machine.js'
import {initialRunView, transitionRunView, type RunView} from './run-state.js'
import {causeFrom, testRunnerErrors} from './errors/errors.js'

type Client = Context['client']

export type TestRunnerRuntime = ManagedRuntime.ManagedRuntime<never, never>

const TEST_EVENT = 'rpc.test-runner.event'

function readRun(client: Client) {
  return Effect.tryPromise({
    try: async (signal) => {
      const runner = client.rpc(TestRunner)
      const status = await runner.status(undefined, {signal})
      const current = await runner.current(undefined, {signal})
      return {status, current}
    },
    catch: (cause) => testRunnerErrors.RUN_READ_FAILED(causeFrom(cause)),
  })
}

function decodeEvent(event: {readonly type: string; readonly data?: unknown}): TestRunnerFollowMachine.FollowEvent {
  if (event.type === 'server.connected') return {type: 'server-connected'}
  const parsed = TestEventSchema.safeParse(event.data)
  return parsed.success ? {type: 'event', event: parsed.data} : {type: 'event-invalid', error: parsed.error}
}

const followTestRun = Effect.fn('TestRunner.follow')(function* (
  client: Client,
  view: SubscriptionRef.SubscriptionRef<RunView>,
) {
  const state = yield* Ref.make(TestRunnerFollowMachine.createFollowState())
  const reads = yield* FiberHandle.make<void, never>()
  const transitions = yield* Semaphore.make(1)

  const read = (attempt: number): Effect.Effect<void> =>
    readRun(client).pipe(
      Effect.matchEffect({
        onSuccess: ({status, current}) => dispatch({type: 'read-done', attempt, status, current}),
        onFailure: (error) => dispatch({type: 'read-failed', attempt, error}),
      }),
    )

  const perform = (effect: TestRunnerFollowMachine.FollowEffect): Effect.Effect<void> => {
    if (effect.type === 'apply')
      return SubscriptionRef.update(view, (current) => transitionRunView(current, effect.action))
    if (effect.type === 'log')
      return Effect.logError(effect.message).pipe(Effect.annotateLogs({plugin: 'test-runner', cause: effect.error}))
    return FiberHandle.run(reads, read(effect.attempt)).pipe(Effect.asVoid)
  }

  const dispatch = (event: TestRunnerFollowMachine.FollowEvent): Effect.Effect<void> =>
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const effects = yield* Ref.modify(state, (current) => {
          const next = TestRunnerFollowMachine.transitionFollow(current, event)
          return [next.effects, next.state]
        })
        yield* Effect.forEach(effects, perform, {discard: true})
      }),
    )

  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}))

  yield* Stream.fromAsyncIterable(client.event.subscribe({types: [TEST_EVENT]}), (cause) =>
    testRunnerErrors.EVENTS_FAILED(causeFrom(cause)),
  ).pipe(
    Stream.runForEach((event) => dispatch(decodeEvent(event))),
    Effect.catch((error) => dispatch({type: 'stream-failed', error})),
  )
})

function fromRef(runtime: TestRunnerRuntime, ref: SubscriptionRef.SubscriptionRef<RunView>): Accessor<RunView> {
  const [store, setStore] = createStore<{view: RunView}>({view: structuredClone(initialRunView)})
  const fiber = runtime.runFork(
    Stream.runForEach(SubscriptionRef.changes(ref), (value) =>
      Effect.sync(() => setStore('view', reconcile(structuredClone(value), {key: 'id'}))),
    ),
  )
  onCleanup(() => void runtime.runFork(Fiber.interrupt(fiber)))
  return () => store.view
}

export function followRunView(runtime: TestRunnerRuntime, client: Client): Accessor<RunView> {
  const view = runtime.runSync(SubscriptionRef.make(initialRunView))
  const fiber = runtime.runFork(Effect.scoped(followTestRun(client, view)))
  onCleanup(() => void runtime.runFork(Fiber.interrupt(fiber)))
  return fromRef(runtime, view)
}
