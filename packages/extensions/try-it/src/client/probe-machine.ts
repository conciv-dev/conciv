export type ProbeState =
  | {kind: 'probing'; hinted: boolean}
  | {kind: 'holding'; base: string}
  | {kind: 'connected'; base: string}

export type ProbeEvent = {type: 'answered'; base: string} | {type: 'silent'} | {type: 'slow'} | {type: 'held'}

export type ProbePlan = {handOff: string | null}

export const SEARCHING: ProbeState = {kind: 'probing', hinted: false}

export function reachedCore(state: ProbeState): boolean {
  return state.kind !== 'probing'
}

export function hintedSlow(state: ProbeState): boolean {
  return state.kind === 'probing' && state.hinted
}

export function holdingBase(state: ProbeState): string | null {
  return state.kind === 'holding' ? state.base : null
}

function onAnswered(state: ProbeState, base: string): ProbeState {
  if (state.kind !== 'probing') return state
  return {kind: 'holding', base}
}

function onSlow(state: ProbeState): ProbeState {
  if (state.kind !== 'probing' || state.hinted) return state
  return {kind: 'probing', hinted: true}
}

function onHeld(state: ProbeState): ProbeState {
  if (state.kind !== 'holding') return state
  return {kind: 'connected', base: state.base}
}

export function probeTransition(state: ProbeState, event: ProbeEvent): ProbeState {
  if (event.type === 'answered') return onAnswered(state, event.base)
  if (event.type === 'slow') return onSlow(state)
  if (event.type === 'held') return onHeld(state)
  return state
}

export function probePlanFor(before: ProbeState, after: ProbeState): ProbePlan {
  if (after.kind === 'connected' && before.kind !== 'connected') return {handOff: after.base}
  return {handOff: null}
}
