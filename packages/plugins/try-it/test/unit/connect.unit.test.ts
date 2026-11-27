import {it} from '@effect/vitest'
import {Effect, Ref, SubscriptionRef} from 'effect'
import {TestClock} from 'effect/testing'
import {describe, expect} from 'vitest'
import {connect} from '../../src/connect.js'
import {TryItProbe} from '../../src/probe.js'
import {tryItErrors} from '../../src/errors/errors.js'

describe('the try-it plugin while no local engine answers', () => {
  it.effect(
    'waits twice as long between probes each time, up to five times the probe interval, and connects once a probe answers, though every silent probe failed at once',
    () =>
      Effect.gen(function* () {
        const base = 'http://127.0.0.1:7357'
        const probes = yield* Ref.make(0)
        const probe = Ref.updateAndGet(probes, (count) => count + 1).pipe(
          Effect.flatMap((count) => (count > 7 ? Effect.succeed(base) : Effect.fail(tryItErrors.PROBE_SILENT()))),
        )
        const {state} = yield* connect({timings: {probeMs: 100, holdMs: 1_000, slowMs: 10_000}}).pipe(
          Effect.provideService(TryItProbe, {probe}),
        )
        const seen: number[] = []
        for (const wait of [99, 1, 199, 1, 399, 1, 499, 1, 499, 1]) {
          yield* TestClock.adjust(wait)
          seen.push(yield* Ref.get(probes))
        }
        expect(seen).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 7])
        expect(yield* SubscriptionRef.get(state)).toMatchObject({status: 'probing'})

        yield* TestClock.adjust(500)
        expect(yield* SubscriptionRef.get(state)).toMatchObject({status: 'holding', base})
        yield* TestClock.adjust(1_000)
        expect(yield* SubscriptionRef.get(state)).toEqual({status: 'connected', base})
      }).pipe(Effect.scoped),
  )
})
