import type {LiveSession} from '@conciv/contract'
import {orderCandidates, type Adopted} from './connect-steps.js'

export type Frozen = LiveSession[] | null

export type ConnectState =
  | {kind: 'closed'}
  | {kind: 'picking'; held: Frozen; error: string | null; retryId: string | null; attempt: LiveSession | null}
  | {kind: 'connecting'; held: Frozen; candidate: LiveSession}
  | {kind: 'snippet'; command: string; detail: string}
  | {kind: 'reload'; held: Frozen; adopted: Adopted; dialled: boolean}
  | {kind: 'leaveConfirm'; held: Frozen; adopted: Adopted}

export type ConnectEvent =
  | {type: 'open'; cached: LiveSession[] | null}
  | {type: 'listed'; candidates: LiveSession[]}
  | {type: 'refreshed'; candidates: LiveSession[]}
  | {type: 'pick'; candidate: LiveSession}
  | {type: 'adopted'; candidateId: string; adopted: Adopted; ready: boolean}
  | {type: 'adoptFailed'; candidateId: string; message: string; snippet: string | null}
  | {type: 'dialledIn'}
  | {type: 'back'}
  | {type: 'keepWaiting'}
  | {type: 'close'}
  | {type: 'done'}

export const CLOSED_CONNECT: ConnectState = {kind: 'closed'}

export function heldOf(state: ConnectState): Frozen {
  if (state.kind === 'closed' || state.kind === 'snippet') return null
  return state.held
}

export function attemptOf(state: ConnectState): LiveSession | null {
  if (state.kind === 'connecting') return state.candidate
  if (state.kind === 'picking') return state.attempt
  return null
}

export function adoptedOf(state: ConnectState): Adopted | null {
  if (state.kind === 'reload' || state.kind === 'leaveConfirm') return state.adopted
  return null
}

export function dialledIn(state: ConnectState): boolean {
  return state.kind === 'reload' && state.dialled
}

function listing(held: Frozen): ConnectState {
  return {kind: 'picking', held, error: null, retryId: null, attempt: null}
}

function decide(candidates: LiveSession[]): ConnectState {
  const held = orderCandidates(candidates)
  const only = held.length === 1 ? held[0] : undefined
  if (only) return {kind: 'connecting', held, candidate: only}
  return listing(held)
}

function onOpen(cached: LiveSession[] | null): ConnectState {
  if (cached === null) return listing(null)
  return decide(cached)
}

function onListed(state: ConnectState, candidates: LiveSession[]): ConnectState {
  if (state.kind !== 'picking' || state.held !== null) return state
  return decide(candidates)
}

function onRefreshed(state: ConnectState, candidates: LiveSession[]): ConnectState {
  if (state.kind === 'closed' || state.kind === 'snippet') return state
  return {...state, held: orderCandidates(candidates)}
}

function onPick(state: ConnectState, candidate: LiveSession): ConnectState {
  if (state.kind !== 'picking') return state
  return {kind: 'picking', held: state.held, error: null, retryId: null, attempt: candidate}
}

function onAdopted(state: ConnectState, adopted: Adopted, ready: boolean): ConnectState {
  if (ready) return CLOSED_CONNECT
  return {kind: 'reload', held: heldOf(state), adopted, dialled: false}
}

function onAdoptFailed(state: ConnectState, message: string, sessionId: string, snippet: string | null): ConnectState {
  if (snippet !== null) return {kind: 'snippet', command: snippet, detail: message}
  return {kind: 'picking', held: heldOf(state), error: message, retryId: sessionId, attempt: null}
}

function answering(state: ConnectState, candidateId: string): boolean {
  return attemptOf(state)?.sessionId === candidateId
}

function onDialledIn(state: ConnectState): ConnectState {
  if (state.kind === 'leaveConfirm') return {kind: 'reload', held: state.held, adopted: state.adopted, dialled: true}
  if (state.kind !== 'reload' || state.dialled) return state
  return {...state, dialled: true}
}

function onClose(state: ConnectState): ConnectState {
  if (state.kind === 'reload' && !state.dialled) {
    return {kind: 'leaveConfirm', held: state.held, adopted: state.adopted}
  }
  return CLOSED_CONNECT
}

function onKeepWaiting(state: ConnectState): ConnectState {
  if (state.kind !== 'leaveConfirm') return CLOSED_CONNECT
  return {kind: 'reload', held: state.held, adopted: state.adopted, dialled: false}
}

export function connectTransition(state: ConnectState, event: ConnectEvent): ConnectState {
  if (event.type === 'open') return onOpen(event.cached)
  if (event.type === 'listed') return onListed(state, event.candidates)
  if (event.type === 'refreshed') return onRefreshed(state, event.candidates)
  if (event.type === 'pick') return onPick(state, event.candidate)
  if (event.type === 'adopted') {
    return answering(state, event.candidateId) ? onAdopted(state, event.adopted, event.ready) : state
  }
  if (event.type === 'adoptFailed') {
    return answering(state, event.candidateId)
      ? onAdoptFailed(state, event.message, event.candidateId, event.snippet)
      : state
  }
  if (event.type === 'dialledIn') return onDialledIn(state)
  if (event.type === 'back') return listing(heldOf(state))
  if (event.type === 'keepWaiting') return onKeepWaiting(state)
  if (event.type === 'close') return onClose(state)
  return CLOSED_CONNECT
}

export type ConnectPlan = {
  adopt: LiveSession | null
  follow: Adopted | null
  announce: Adopted | null
  handBack: Adopted | null
}

function adoptOf(before: ConnectState, after: ConnectState): LiveSession | null {
  const next = attemptOf(after)
  if (!next) return null
  if (attemptOf(before)?.sessionId === next.sessionId) return null
  return next
}

function followOf(before: ConnectState, after: ConnectState, event: ConnectEvent): Adopted | null {
  if (event.type === 'adopted' && after.kind === 'closed' && before.kind !== 'closed') return event.adopted
  if (after.kind === 'reload' && after.dialled && !dialledIn(before)) return after.adopted
  return null
}

function announceOf(before: ConnectState, after: ConnectState, event: ConnectEvent): Adopted | null {
  if (event.type !== 'adopted' || after !== before) return null
  return event.adopted
}

function handBackOf(before: ConnectState, after: ConnectState, event: ConnectEvent): Adopted | null {
  if (event.type !== 'close' || before.kind !== 'leaveConfirm' || after.kind !== 'closed') return null
  return before.adopted
}

export function connectPlanFor(before: ConnectState, after: ConnectState, event: ConnectEvent): ConnectPlan {
  return {
    adopt: adoptOf(before, after),
    follow: followOf(before, after, event),
    announce: announceOf(before, after, event),
    handBack: handBackOf(before, after, event),
  }
}
