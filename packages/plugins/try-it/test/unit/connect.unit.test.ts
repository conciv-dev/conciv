import {it} from '@effect/vitest'
import {Effect, Ref} from 'effect'
import {TestClock} from 'effect/testing'
import {describe, expect} from 'vitest'
import {connect} from '../../src/connect.js'
import {TryItProbe, makeProbeSilent} from '../../src/probe.js'

describe('the try-it plugin with no local engine answering', () => {
  it.effect('waits twice as long between probes each time, up to five times the probe interval', () =>
    Effect.gen(function* () {
      const probes = yield* Ref.make(0)
      const probe = Ref.update(probes, (count) => count + 1).pipe(
        Effect.andThen(Effect.yieldNow),
        Effect.andThen(Effect.fail(makeProbeSilent())),
      )
      yield* connect({timings: {probeMs: 100, holdMs: 1_000, slowMs: 10_000}}).pipe(
        Effect.provideService(TryItProbe, {probe}),
      )
      yield* Effect.yieldNow
      const waits = [99, 1, 199, 1, 399, 1, 499, 1, 499, 1]
      const seen = [yield* Ref.get(probes)]
      for (const wait of waits) {
        yield* TestClock.adjust(wait)
        seen.push(yield* Ref.get(probes))
      }
      expect(seen).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7])
    }).pipe(Effect.scoped),
  )
})
