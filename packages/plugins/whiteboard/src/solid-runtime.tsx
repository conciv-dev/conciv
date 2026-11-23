import {createContext, from, onCleanup, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {Effect, Exit, Fiber, Scope, Stream, SubscriptionRef, type ManagedRuntime} from 'effect'

export type WhiteboardRuntime = ManagedRuntime.ManagedRuntime<never, never>

const WhiteboardRuntimeContext = createContext<WhiteboardRuntime>()

export function WhiteboardRuntimeProvider(props: {runtime: WhiteboardRuntime; children: JSX.Element}): JSX.Element {
  const runtime = untrack(() => props.runtime)
  return <WhiteboardRuntimeContext.Provider value={runtime}>{props.children}</WhiteboardRuntimeContext.Provider>
}

export function useWhiteboardRuntime(): WhiteboardRuntime {
  const runtime = useContext(WhiteboardRuntimeContext)
  if (!runtime) throw new Error('useWhiteboardRuntime must be used inside a WhiteboardRuntimeProvider')
  return runtime
}

export function follow<A>(runtime: WhiteboardRuntime, ref: SubscriptionRef.SubscriptionRef<A>): Accessor<A> {
  return from<A>((set) => {
    const fiber = runtime.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => set(() => value))),
    )
    return () => void runtime.runFork(Fiber.interrupt(fiber))
  }, SubscriptionRef.getUnsafe(ref))
}

export function runInOwnerScope<Value>(
  runtime: WhiteboardRuntime,
  effect: Effect.Effect<Value, never, Scope.Scope>,
): Value {
  const scope = Scope.forkUnsafe(runtime.scope)
  onCleanup(
    () => void Effect.runFork(Effect.forkIn(Scope.close(scope, Exit.void), runtime.scope, {startImmediately: true})),
  )
  return runtime.runSync(Scope.provide(effect, scope))
}
