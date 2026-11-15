import {setTimeout} from 'node:timers/promises'
import {Effect} from 'effect'
import {TestClock} from 'effect/testing'

const settle = Effect.promise(() => setTimeout(1))

const tick = Effect.gen(function* () {
  yield* settle
  yield* TestClock.adjust('500 millis')
})

export const advance = Effect.fnUntraced(function* (condition: () => boolean) {
  const deadline = performance.now() + 15_000
  while (performance.now() < deadline) {
    if (condition()) return
    yield* tick
  }
  if (condition()) return
  return yield* Effect.die(new Error('condition never became true within 15s'))
})
