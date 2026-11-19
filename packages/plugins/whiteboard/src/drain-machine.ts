import {keyBy, mapValues, omit} from 'es-toolkit'
import type {PendingRow} from './rows.js'

type DrainPhase =
  | {readonly phase: 'claiming' | 'running' | 'removing'; readonly attempt: number; readonly row: PendingRow}
  | {readonly phase: 'done'}

export type DrainState =
  | {readonly status: 'active'; readonly nextAttempt: number; readonly rows: Readonly<Record<string, DrainPhase>>}
  | {readonly status: 'disposed'}

export type DrainEvent =
  | {readonly type: 'seen'; readonly rows: readonly PendingRow[]}
  | {readonly type: 'claimed'; readonly id: string; readonly attempt: number; readonly claimed: boolean}
  | {readonly type: 'ran'; readonly id: string; readonly attempt: number}
  | {readonly type: 'removed'; readonly id: string; readonly attempt: number}
  | {readonly type: 'disposed'}

export type DrainEffect = {
  readonly type: 'claim' | 'run' | 'remove'
  readonly attempt: number
  readonly row: PendingRow
}

type DrainTransition = {readonly state: DrainState; readonly effects: readonly DrainEffect[]}

type ActiveDrain = Extract<DrainState, {readonly status: 'active'}>

export function startDrain(): DrainTransition {
  return {state: {status: 'active', nextAttempt: 0, rows: {}}, effects: []}
}

function see(state: ActiveDrain, rows: readonly PendingRow[]): DrainTransition {
  const fresh = rows.filter((row) => state.rows[row.id] === undefined)
  if (!fresh.length) return {state, effects: []}
  const effects = fresh.map((row, index): DrainEffect => ({type: 'claim', attempt: state.nextAttempt + index, row}))
  const claiming = mapValues(
    keyBy(effects, (effect) => effect.row.id),
    ({attempt, row}): DrainPhase => ({phase: 'claiming', attempt, row}),
  )
  return {
    state: {status: 'active', nextAttempt: state.nextAttempt + fresh.length, rows: {...state.rows, ...claiming}},
    effects,
  }
}

function withRow(state: ActiveDrain, id: string, phase: DrainPhase | undefined): ActiveDrain {
  const rows = omit(state.rows, [id])
  return {...state, rows: phase ? {...rows, [id]: phase} : rows}
}

function advance(
  state: ActiveDrain,
  event: Exclude<DrainEvent, {readonly type: 'seen' | 'disposed'}>,
): DrainTransition {
  const current = state.rows[event.id]
  const expected = {claimed: 'claiming', ran: 'running', removed: 'removing'}[event.type]
  if (current === undefined || current.phase === 'done') return {state, effects: []}
  if (current.phase !== expected || current.attempt !== event.attempt) return {state, effects: []}
  if (event.type === 'claimed' && !event.claimed) return {state: withRow(state, event.id, undefined), effects: []}
  if (current.phase === 'removing') return {state: withRow(state, event.id, {phase: 'done'}), effects: []}
  const running = current.phase === 'claiming'
  return {
    state: withRow(state, event.id, {
      phase: running ? 'running' : 'removing',
      attempt: current.attempt,
      row: current.row,
    }),
    effects: [{type: running ? 'run' : 'remove', attempt: current.attempt, row: current.row}],
  }
}

export function transitionDrain(state: DrainState, event: DrainEvent): DrainTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: []}
  if (event.type === 'seen') return see(state, event.rows)
  return advance(state, event)
}
