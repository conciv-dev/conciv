import {engineKitErrors} from './errors/errors.js'

const ADVANCE_LIMIT_MS = 15_000

const DRAIN_STEPS = 4

export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1))
}

export async function advanceUntil<T>(until: Promise<T>, step: () => Promise<void>): Promise<T> {
  const watch = {settled: false}
  until
    .finally(() => {
      watch.settled = true
    })
    .catch(() => {})
  const deadline = performance.now() + ADVANCE_LIMIT_MS
  while (!watch.settled && performance.now() < deadline) await step()
  if (!watch.settled) throw engineKitErrors.CLOCK_NEVER_SETTLED()
  return until
}

export async function drainWith(step: () => Promise<void>): Promise<void> {
  for (let count = 0; count < DRAIN_STEPS; count += 1) await step()
  await settle()
}

export async function refuseRealClock(): Promise<never> {
  throw engineKitErrors.REAL_CLOCK()
}
