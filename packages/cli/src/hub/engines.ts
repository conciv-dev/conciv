import {differenceBy} from 'es-toolkit'
import {Cache, Duration, Effect, Exit} from 'effect'
import {ORPCError} from '@orpc/client'
import type {EngineRow} from '@conciv/db'
import {engineTooOld, makeRpcClient, type CodeDescriptions, type RpcClient} from '@conciv/contract'
import {
  askAgain,
  ENGINE_READ_MS,
  errorText,
  homeRead,
  logHub,
  runningEngines,
  silence,
  TOO_OLD,
  type Checked,
  type Silent,
} from '../engine-read.js'

export type Runner = {root: string; rpc: RpcClient; described: CodeDescriptions | null}

export type Candidate = {runner: Runner; unusable: null} | {runner: null; unusable: string}

type Round = {seen: EngineRow[]; unusable: string[]; silent: Silent}

export type EnginesState =
  | {status: 'none'}
  | ({status: 'picking'; round: 'first' | 'second'; candidates: [EngineRow, ...EngineRow[]]} & Round)
  | ({status: 'asking-again'} & Round)
  | {status: 'picked'; runner: Runner}
  | {status: 'unusable'; reason: string}

export type EnginesEvent =
  | {type: 'listed'; checked: Checked}
  | {type: 'answered'; row: EngineRow; candidate: Candidate}
  | {type: 'asked-again'; checked: Checked}

const RUNNER = 'runner'

export function transitionEngines(state: EnginesState, event: EnginesEvent): EnginesState {
  if (state.status === 'none' && event.type === 'listed') {
    const round = {seen: event.checked.live, unusable: [], silent: event.checked.unreachable}
    return picking('first', event.checked.live, round)
  }
  if (state.status === 'picking' && event.type === 'answered') {
    if (event.candidate.runner !== null) return {status: 'picked', runner: event.candidate.runner}
    const unusable = [...state.unusable, `${event.row.root} (${event.candidate.unusable})`]
    return picking(state.round, state.candidates.slice(1), {seen: state.seen, unusable, silent: state.silent})
  }
  if (state.status === 'asking-again' && event.type === 'asked-again') {
    const fresh = differenceBy(event.checked.live, state.seen, (row) => row.id)
    return picking('second', fresh, {seen: state.seen, unusable: state.unusable, silent: event.checked.unreachable})
  }
  return state
}

function picking(round: 'first' | 'second', candidates: EngineRow[], held: Round): EnginesState {
  const [first, ...rest] = candidates
  if (first !== undefined) return {status: 'picking', round, candidates: [first, ...rest], ...held}
  if (round === 'first') return {status: 'asking-again', ...held}
  return {status: 'unusable', reason: noRunner(held.unusable, held.silent)}
}

function noRunner(unusable: string[], silent: Silent): string {
  if (unusable.length === 0) return `no conciv dev server answered: ${silence(silent)}`
  const named = silent.length === 0 ? unusable : [...unusable, silence(silent)]
  return `no conciv dev server this hub can use is running: ${named.join('; ')}`
}

export const makeEngines = Effect.fn('Engines.make')(function* (home: string, headers: Record<string, string>) {
  const runners = yield* Cache.makeWith((_key: typeof RUNNER) => pickStep(home, headers, {status: 'none'}), {
    capacity: 1,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
  })
  return {
    runner: Cache.get(runners, RUNNER),
    drop: (runner: Runner) => Cache.invalidateWhen(runners, RUNNER, (held) => held === runner).pipe(Effect.asVoid),
  }
})

export type Engines = Effect.Success<ReturnType<typeof makeEngines>>

function pickStep(home: string, headers: Record<string, string>, state: EnginesState): Effect.Effect<Runner, unknown> {
  if (state.status === 'picked') return Effect.succeed(state.runner)
  if (state.status === 'unusable') return Effect.fail(new Error(state.reason))
  if (state.status === 'asking-again') {
    return Effect.tryPromise({try: () => homeRead(home, askAgain(home, state.silent)), catch: (error) => error}).pipe(
      Effect.flatMap((checked) => pickStep(home, headers, transitionEngines(state, {type: 'asked-again', checked}))),
    )
  }
  if (state.status === 'none') {
    return Effect.tryPromise({try: () => runningEngines(home), catch: (error) => error}).pipe(
      Effect.flatMap((checked) => pickStep(home, headers, transitionEngines(state, {type: 'listed', checked}))),
    )
  }
  const [row] = state.candidates
  return Effect.promise(() => runnerAt(row, headers)).pipe(
    Effect.flatMap((candidate) =>
      pickStep(home, headers, transitionEngines(state, {type: 'answered', row, candidate})),
    ),
  )
}

async function runnerAt(row: EngineRow, headers: Record<string, string>): Promise<Candidate> {
  const rpc = makeRpcClient(row.apiBase, {token: row.token, headers})
  return rpc.code.describe(undefined, {signal: AbortSignal.timeout(ENGINE_READ_MS)}).then(
    (described): Candidate => ({runner: {root: row.root, rpc, described}, unusable: null}),
    (error: unknown): Candidate => {
      if (engineTooOld(error)) return {runner: null, unusable: TOO_OLD}
      if (error instanceof ORPCError && error.code === 'NO_CODE_MODE') return {runner: null, unusable: errorText(error)}
      logHub(`reading the tool descriptions of the conciv engine at ${row.root} failed; using the built-in text`, error)
      return {runner: {root: row.root, rpc, described: null}, unusable: null}
    },
  )
}
