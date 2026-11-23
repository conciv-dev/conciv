import {Context, Effect, Schema} from 'effect'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM} from '@conciv/protocol/rpc-types'

const ProbeFailed = Schema.TaggedStruct('TryIt.ProbeFailed', {port: Schema.Int, cause: Schema.Defect()})
type ProbeFailed = typeof ProbeFailed.Type & globalThis.Error

const makeProbeFailed = (fields: Omit<typeof ProbeFailed.Type, '_tag'>): ProbeFailed =>
  Object.assign(new globalThis.Error(), ProbeFailed.make(fields), {name: 'TryIt.ProbeFailed'})

const ProbeSilent = Schema.TaggedStruct('TryIt.ProbeSilent', {})
type ProbeSilent = typeof ProbeSilent.Type & globalThis.Error

export const makeProbeSilent = (): ProbeSilent =>
  Object.assign(new globalThis.Error(), ProbeSilent.make({}), {name: 'TryIt.ProbeSilent'})

export const TryItProbe = Context.Service<{readonly probe: Effect.Effect<string, ProbeSilent>}>(
  '@conciv/plugin-try-it/Probe',
)

function authedProbeUrl(base: string, token: string): URL {
  const url = new URL('/rpc/meta/harnesses', base)
  url.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, token)
  return url
}

function probePort(token: string, port: number) {
  const base = `http://127.0.0.1:${port}`
  return Effect.tryPromise({
    try: (signal) => fetch(authedProbeUrl(base, token), {method: 'POST', signal}),
    catch: (cause) => makeProbeFailed({port, cause}),
  }).pipe(
    Effect.filterOrFail(
      (response) => response.ok,
      (response) => makeProbeFailed({port, cause: response.status}),
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
    Effect.mapError(() => makeProbeSilent()),
  )
})
