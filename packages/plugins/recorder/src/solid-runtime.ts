import {from, observable, onCleanup, type Accessor} from 'solid-js'
import {Effect, Exit, Fiber, Queue, Scope, Stream, SubscriptionRef, type ManagedRuntime} from 'effect'

export type RecorderRuntime = ManagedRuntime.ManagedRuntime<never, never>

export function follow<A>(runtime: RecorderRuntime, ref: SubscriptionRef.SubscriptionRef<A>): Accessor<A> {
  return from<A>((set) => {
    const fiber = runtime.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => set(() => value))),
    )
    return () => void runtime.runFork(Fiber.interrupt(fiber))
  }, SubscriptionRef.getUnsafe(ref))
}

export function accessorStream<Value>(accessor: Accessor<Value>): Stream.Stream<Value> {
  const values = observable(accessor)
  return Stream.callback<Value>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => values.subscribe((value) => void Queue.offerUnsafe(queue, value))),
      (subscription) => Effect.sync(() => subscription.unsubscribe()),
    ),
  )
}

export function runInOwnerScope<Value>(
  runtime: RecorderRuntime,
  effect: Effect.Effect<Value, never, Scope.Scope>,
): Value {
  const scope = Scope.forkUnsafe(runtime.scope)
  onCleanup(
    () => void Effect.runFork(Effect.forkIn(Scope.close(scope, Exit.void), runtime.scope, {startImmediately: true})),
  )
  return runtime.runSync(Scope.provide(effect, scope))
}
