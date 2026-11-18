import {from, type Accessor} from 'solid-js'
import {Effect, Fiber, Stream, SubscriptionRef} from 'effect'

export function refAccessor<A>(ref: SubscriptionRef.SubscriptionRef<A>, initial: A): Accessor<A> {
  return from<A>((set) => {
    const fiber = Effect.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => void set(() => value))),
    )
    return () => void Effect.runFork(Fiber.interrupt(fiber))
  }, initial)
}
