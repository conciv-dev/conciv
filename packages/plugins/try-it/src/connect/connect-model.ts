import {Effect, Fiber, Option, Schedule} from 'effect'
import {probeCore} from './probe.js'

const SILENT = 'silent' as const

export type ConnectState =
  | {readonly phase: 'probing'; readonly slow: boolean}
  | {readonly phase: 'holding'; readonly base: string}
  | {readonly phase: 'connected'; readonly base: string}

export type ConnectTimings = {readonly probeMs: number; readonly holdMs: number; readonly slowMs: number}

export type ConnectInput = {
  readonly token: string
  readonly ports: readonly number[]
  readonly timings: ConnectTimings
  readonly report: (state: ConnectState) => void
}

function sweep(input: ConnectInput): Effect.Effect<string, 'silent'> {
  return Effect.promise((signal) =>
    probeCore(input.token, input.ports, AbortSignal.any([signal, AbortSignal.timeout(input.timings.probeMs)])),
  ).pipe(Effect.flatMap((base) => (base === null ? Effect.fail(SILENT) : Effect.succeed(base))))
}

export const connect = Effect.fn('TryIt.connect')(function* (input: ConnectInput) {
  const report = (state: ConnectState) => Effect.sync(() => input.report(state))
  const answered = yield* Effect.option(sweep(input))
  if (Option.isSome(answered)) return yield* report({phase: 'connected', base: answered.value})
  yield* report({phase: 'probing', slow: false})
  const hint = yield* Effect.forkChild(
    Effect.sleep(input.timings.slowMs).pipe(Effect.andThen(report({phase: 'probing', slow: true}))),
  )
  const base = yield* sweep(input).pipe(Effect.retry(Schedule.spaced(input.timings.probeMs)))
  yield* Fiber.interrupt(hint)
  yield* report({phase: 'holding', base})
  yield* Effect.sleep(input.timings.holdMs)
  yield* report({phase: 'connected', base})
})
