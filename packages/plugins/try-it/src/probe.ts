import {Data, Effect} from 'effect'

export const ProbeFailed = Data.TaggedError('TryItProbeFailed')<{readonly port: number; readonly cause: unknown}>
export const ProbeSilent = Data.TaggedError('ProbeSilent')<Record<never, never>>

export type ProbeSilent = InstanceType<typeof ProbeSilent>

function probePort(token: string, port: number) {
  const base = `http://127.0.0.1:${port}/t/${token}`
  return Effect.tryPromise({
    try: (signal) => fetch(`${base}/health`, {signal}),
    catch: (cause) => new ProbeFailed({port, cause}),
  }).pipe(
    Effect.filterOrFail(
      (response) => response.ok,
      (response) => new ProbeFailed({port, cause: response.status}),
    ),
    Effect.as(base),
  )
}

export const probeCore = Effect.fn('try-it.probeCore')(function* (
  token: string,
  ports: readonly number[],
  probeMs: number,
) {
  return yield* Effect.raceAll(ports.map((port) => probePort(token, port))).pipe(
    Effect.timeout(probeMs),
    Effect.mapError(() => new ProbeSilent()),
  )
})
