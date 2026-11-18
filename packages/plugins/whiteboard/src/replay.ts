import {Deferred, Effect} from 'effect'

export type ReplayStep<Result> = {elementId: string; write: () => Result}

export function replayDraft<Result>(
  steps: readonly ReplayStep<Result>[],
  skipped: Deferred.Deferred<void>,
): Effect.Effect<Result[]> {
  const perStep = Math.max(60, Math.min(3000 / Math.max(steps.length, 1), 400))
  const pause = Effect.race(Effect.sleep(perStep), Deferred.await(skipped))
  return Effect.forEach(steps, (step, index) =>
    (index === 0 ? Effect.void : pause).pipe(Effect.andThen(Effect.sync(step.write))),
  ).pipe(Effect.withSpan('whiteboard.replay'))
}
