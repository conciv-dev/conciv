import {from, observable, onCleanup, type Accessor} from 'solid-js'
import {Effect, Exit, Fiber, Layer, ManagedRuntime, Queue, Scope, Stream, SubscriptionRef} from 'effect'

export type PluginRuntime = ManagedRuntime.ManagedRuntime<never, never>

export function makePluginRuntime(): PluginRuntime {
  const runtime = ManagedRuntime.make(Layer.empty)
  onCleanup(() => void Effect.runPromise(Scope.close(runtime.scope, Exit.void)).then(() => runtime.dispose()))
  return runtime
}

export function subscriptionRefSignal<Value>(
  runtime: PluginRuntime,
  ref: SubscriptionRef.SubscriptionRef<Value>,
): Accessor<Value> {
  return from<Value>((set) => {
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
  runtime: PluginRuntime,
  effect: Effect.Effect<Value, never, Scope.Scope>,
): Value {
  const scope = Scope.forkUnsafe(runtime.scope)
  onCleanup(
    () => void Effect.runFork(Effect.forkIn(Scope.close(scope, Exit.void), runtime.scope, {startImmediately: true})),
  )
  return runtime.runSync(Scope.provide(effect, scope))
}
