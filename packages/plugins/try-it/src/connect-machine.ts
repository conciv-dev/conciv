export * as TryItConnectMachine from './connect-machine.js'
export type ConnectState =
  | {readonly status: 'probing'; readonly attempt: number; readonly slow: boolean; readonly copied: boolean}
  | {readonly status: 'holding'; readonly base: string; readonly copied: boolean}
  | {readonly status: 'connected'; readonly base: string}
  | {readonly status: 'disposed'}

export type ConnectEvent =
  | {readonly type: 'answered'; readonly attempt: number; readonly base: string}
  | {readonly type: 'silent'; readonly attempt: number}
  | {readonly type: 'slowElapsed'}
  | {readonly type: 'holdElapsed'}
  | {readonly type: 'copied'}
  | {readonly type: 'disposed'}

export type ConnectEffect =
  | {readonly type: 'sweep'; readonly attempt: number; readonly retry: boolean}
  | {readonly type: 'startSlow'}
  | {readonly type: 'stopSlow'}
  | {readonly type: 'startHold'}

type ConnectTransition = {readonly state: ConnectState; readonly effects: readonly ConnectEffect[]}

const FIRST_ATTEMPT = 1

export const initialConnect: ConnectTransition = {
  state: {status: 'probing', attempt: FIRST_ATTEMPT, slow: false, copied: false},
  effects: [{type: 'sweep', attempt: FIRST_ATTEMPT, retry: false}],
}

export function awaitingFirstSweep(state: ConnectState): boolean {
  return state.status === 'probing' && state.attempt === FIRST_ATTEMPT
}

const unchanged = (state: ConnectState): ConnectTransition => ({state, effects: []})

export function transitionConnect(state: ConnectState, event: ConnectEvent): ConnectTransition {
  if (state.status === 'disposed') return unchanged(state)
  if (event.type === 'disposed' && state.status === 'probing')
    return {state: {status: 'disposed'}, effects: [{type: 'stopSlow'}]}
  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: []}
  if (state.status === 'probing') return transitionProbing(state, event)
  if (state.status === 'holding') return transitionHolding(state, event)
  return unchanged(state)
}

type ProbingState = Extract<ConnectState, {readonly status: 'probing'}>

function transitionProbing(state: ProbingState, event: ConnectEvent): ConnectTransition {
  if (event.type === 'copied') return state.copied ? unchanged(state) : {state: {...state, copied: true}, effects: []}
  if (event.type === 'slowElapsed') return state.slow ? unchanged(state) : {state: {...state, slow: true}, effects: []}
  if (event.type === 'answered') return answerProbing(state, event)
  if (event.type === 'silent') return silenceProbing(state, event)
  return unchanged(state)
}

function answerProbing(
  state: ProbingState,
  event: Extract<ConnectEvent, {readonly type: 'answered'}>,
): ConnectTransition {
  if (event.attempt !== state.attempt) return unchanged(state)
  if (state.attempt === FIRST_ATTEMPT)
    return {state: {status: 'connected', base: event.base}, effects: [{type: 'stopSlow'}]}
  return {
    state: {status: 'holding', base: event.base, copied: state.copied},
    effects: [{type: 'stopSlow'}, {type: 'startHold'}],
  }
}

function silenceProbing(
  state: ProbingState,
  event: Extract<ConnectEvent, {readonly type: 'silent'}>,
): ConnectTransition {
  if (event.attempt !== state.attempt || state.attempt !== FIRST_ATTEMPT) return unchanged(state)
  return {
    state: {...state, attempt: state.attempt + 1},
    effects: [{type: 'startSlow'}, {type: 'sweep', attempt: state.attempt + 1, retry: true}],
  }
}

function transitionHolding(
  state: Extract<ConnectState, {readonly status: 'holding'}>,
  event: ConnectEvent,
): ConnectTransition {
  if (event.type === 'copied' && !state.copied) return {state: {...state, copied: true}, effects: []}
  if (event.type === 'holdElapsed') return {state: {status: 'connected', base: state.base}, effects: []}
  return unchanged(state)
}
