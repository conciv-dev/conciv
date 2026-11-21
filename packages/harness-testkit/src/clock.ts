import {Effect, Exit, Layer, Scope} from 'effect'
import {TestClock} from 'effect/testing'
import {advanceUntil, drainWith, refuseRealClock, settle} from './clock-steps.js'

export type HarnessEngineClock = {
  advance: <T>(until: Promise<T>) => Promise<T>
  drain: () => Promise<void>
  tick: () => Promise<void>
}

export type HeldClock = {layer: Layer.Layer<never>; clock: HarnessEngineClock; close: () => Promise<void>}

export const realClock: HarnessEngineClock = {advance: refuseRealClock, drain: refuseRealClock, tick: refuseRealClock}

export async function holdTestClock(): Promise<HeldClock> {
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(Layer.buildWithScope(TestClock.layer(), scope))
  const tick = async (): Promise<void> => {
    await settle()
    await Effect.runPromise(TestClock.adjust('500 millis').pipe(Effect.provideContext(context)))
  }
  return {
    layer: Layer.succeedContext(context),
    clock: {advance: (until) => advanceUntil(until, tick), drain: () => drainWith(tick), tick},
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  }
}
