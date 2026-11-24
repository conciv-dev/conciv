import {describe, expect, it} from 'vitest'
import {Effect, Fiber, Stream} from 'effect'
import {TestClock} from 'effect/testing'
import {followEvents, reportRouteChanges} from './attachment.js'

describe('the tab stays attached', () => {
  it('subscribes to route changes without the Navigation API, and follows the engine again after its stream ends or fails', async () => {
    expect(() => reportRouteChanges(() => undefined, new AbortController().signal)).not.toThrow()

    let attempt = 0
    const subscribe = async function* (_signal: AbortSignal) {
      attempt += 1
      if (attempt === 2) throw new Error('the engine is down')
      yield attempt === 1 ? 'before the restart' : 'after the restart'
    }
    const followed = Effect.gen(function* () {
      const fiber = yield* followEvents(subscribe).pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
      yield* TestClock.adjust('2 seconds')
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))
    expect(await Effect.runPromise(followed)).toEqual(['before the restart', 'after the restart'])
  })
})
