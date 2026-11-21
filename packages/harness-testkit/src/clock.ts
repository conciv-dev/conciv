import {Effect, Exit, Layer, Scope} from 'effect'
import {TestClock} from 'effect/testing'

export type HarnessEngineClock = {
  advance: <T>(until: Promise<T>) => Promise<T>
  drain: () => Promise<void>
  tick: () => Promise<void>
}

export type HeldClock = {layer: Layer.Layer<never>; clock: HarnessEngineClock; close: () => Promise<void>}

const ADVANCE_LIMIT_MS = 15_000

const DRAIN_STEPS = 4

const NEVER_SETTLED = 'the engine clock was advanced for 15s and the awaited call never settled'

const REAL_CLOCK = "this engine runs on the real clock: make it with clock: 'test'"

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1))
}

async function advanceUntil<T>(until: Promise<T>, tick: () => Promise<void>): Promise<T> {
  const watch = {settled: false}
  until
    .finally(() => {
      watch.settled = true
    })
    .catch(() => {})
  const deadline = performance.now() + ADVANCE_LIMIT_MS
  while (!watch.settled && performance.now() < deadline) await tick()
  if (!watch.settled) throw new Error(NEVER_SETTLED)
  return until
}

async function drainWith(tick: () => Promise<void>): Promise<void> {
  for (let step = 0; step < DRAIN_STEPS; step += 1) await tick()
  await settle()
}

export const realClock: HarnessEngineClock = {
  advance: async () => {
    throw new Error(REAL_CLOCK)
  },
  drain: async () => {
    throw new Error(REAL_CLOCK)
  },
  tick: async () => {
    throw new Error(REAL_CLOCK)
  },
}

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
