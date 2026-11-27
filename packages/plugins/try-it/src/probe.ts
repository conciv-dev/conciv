import {Context, Effect} from 'effect'
import type {EvlogError} from 'evlog'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM} from '@conciv/types/rpc-types'
import {causeFrom, tryItErrors} from './errors/errors.js'

export const TryItProbe = Context.Service<{readonly probe: Effect.Effect<string, EvlogError>}>(
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
    catch: (cause) => tryItErrors.PROBE_FAILED({port, ...causeFrom(cause)}),
  }).pipe(
    Effect.filterOrFail(
      (response) => response.ok,
      (response) => tryItErrors.PROBE_FAILED({port, internal: {status: response.status}}),
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
    Effect.mapError(() => tryItErrors.PROBE_SILENT()),
  )
})
