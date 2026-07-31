import type {MultimodalContent} from '@tanstack/ai-client'
import type {ComposerDraft} from '@conciv/ui-kit-chat'
import type {StagedGrab} from '../app/pane-context.js'
import {ATTACHED_MESSAGE, conflictAfterTakeOver, conflictFor, NO_CONFLICT, type Conflict} from './conflict.js'

export type SendQuestion = Exclude<Conflict, {kind: 'none'}>

export type SendAttempt = {
  id: number
  content: string | MultimodalContent
  draft: ComposerDraft | null
  grabs: StagedGrab[]
}

export type SendOrigin = 'fresh' | 'take-over' | 'force'

export type SendState =
  | {kind: 'idle'}
  | {kind: 'conflict'; attempt: SendAttempt; conflict: SendQuestion}
  | {kind: 'sending'; attempt: SendAttempt; origin: SendOrigin}
  | {kind: 'sent'}
  | {kind: 'failed'; attempt: SendAttempt; error: unknown}

export type SendEvent =
  | {type: 'send'; attempt: SendAttempt; attached: boolean}
  | {type: 'rejected'; error: unknown; delivered: boolean}
  | {type: 'delivered'; attemptId: number}
  | {type: 'takeOver'}
  | {type: 'detachSettled'; attemptId: number}
  | {type: 'takeOverFailed'; attemptId: number; reason: string}
  | {type: 'sendAnyway'}
  | {type: 'cancel'}

type Sending = Extract<SendState, {kind: 'sending'}>
type Asking = Extract<SendState, {kind: 'conflict'}>

export const IDLE_SEND: SendState = {kind: 'idle'}

const SENT: SendState = {kind: 'sent'}

const TAKING_OVER: SendQuestion = {kind: 'taking-over', message: ATTACHED_MESSAGE}

function asked(attempt: SendAttempt, conflict: SendQuestion): SendState {
  return {kind: 'conflict', attempt, conflict}
}

function sending(attempt: SendAttempt, origin: SendOrigin): SendState {
  return {kind: 'sending', attempt, origin}
}

function classify(origin: SendOrigin, error: unknown): Conflict {
  if (origin === 'take-over') return conflictAfterTakeOver(error)
  return conflictFor(error)
}

function afterRejection(state: Sending, error: unknown, delivered: boolean): SendState {
  if (delivered) return SENT
  const next = classify(state.origin, error)
  if (next.kind === 'none') return {kind: 'failed', attempt: state.attempt, error}
  return asked(state.attempt, next)
}

function rejectedIn(state: SendState, error: unknown, delivered: boolean): SendState {
  if (state.kind === 'sending') return afterRejection(state, error, delivered)
  if (state.kind === 'conflict' && delivered) return SENT
  return state
}

function handingOver(state: SendState, attemptId: number): Asking | null {
  if (state.kind !== 'conflict') return null
  if (state.conflict.kind !== 'taking-over' || state.attempt.id !== attemptId) return null
  return state
}

function afterSend(attempt: SendAttempt, attached: boolean): SendState {
  if (attached) return asked(attempt, {kind: 'attached', message: ATTACHED_MESSAGE})
  return sending(attempt, 'fresh')
}

function afterDelivery(state: SendState, attemptId: number): SendState {
  if (state.kind === 'sending' && state.attempt.id === attemptId) return SENT
  return state
}

function afterTakeOver(state: SendState): SendState {
  if (state.kind !== 'conflict') return state
  return asked(state.attempt, TAKING_OVER)
}

function afterDetach(state: SendState, attemptId: number): SendState {
  const handing = handingOver(state, attemptId)
  if (!handing) return state
  return sending(handing.attempt, 'take-over')
}

function afterHandBackRefused(state: SendState, attemptId: number, reason: string): SendState {
  const handing = handingOver(state, attemptId)
  if (!handing) return state
  return asked(handing.attempt, {kind: 'take-over-failed', message: ATTACHED_MESSAGE, reason})
}

function afterSendAnyway(state: SendState): SendState {
  if (state.kind !== 'conflict') return state
  return sending(state.attempt, 'force')
}

export function transition(state: SendState, event: SendEvent): SendState {
  if (event.type === 'send') return afterSend(event.attempt, event.attached)
  if (event.type === 'rejected') return rejectedIn(state, event.error, event.delivered)
  if (event.type === 'delivered') return afterDelivery(state, event.attemptId)
  if (event.type === 'takeOver') return afterTakeOver(state)
  if (event.type === 'detachSettled') return afterDetach(state, event.attemptId)
  if (event.type === 'takeOverFailed') return afterHandBackRefused(state, event.attemptId, event.reason)
  if (event.type === 'sendAnyway') return afterSendAnyway(state)
  return IDLE_SEND
}

export function questionOf(state: SendState): Conflict {
  if (state.kind === 'conflict') return state.conflict
  return NO_CONFLICT
}

function attemptOf(state: SendState): SendAttempt | null {
  if (state.kind === 'idle' || state.kind === 'sent') return null
  return state.attempt
}

export type SendPlan = {
  abandoned: SendAttempt | null
  cancelled: boolean
  starting: {attempt: SendAttempt; force: boolean} | null
  handing: SendAttempt | null
  cleared: boolean
  failure: {attempt: SendAttempt; error: unknown} | null
}

function startingOf(before: SendState, after: SendState): SendPlan['starting'] {
  if (after.kind !== 'sending') return null
  if (before.kind === 'sending' && before.attempt.id === after.attempt.id) return null
  return {attempt: after.attempt, force: after.origin === 'force'}
}

function handingOf(before: SendState, after: SendState): SendAttempt | null {
  if (after.kind !== 'conflict' || after.conflict.kind !== 'taking-over') return null
  if (before.kind === 'conflict' && before.conflict.kind === 'taking-over') return null
  return after.attempt
}

function failureOf(before: SendState, after: SendState): SendPlan['failure'] {
  if (after.kind !== 'failed' || before.kind === 'failed') return null
  return {attempt: after.attempt, error: after.error}
}

export function planFor(before: SendState, after: SendState, event: SendEvent): SendPlan {
  const cancelled = event.type === 'cancel'
  return {
    abandoned: cancelled ? attemptOf(before) : null,
    cancelled,
    starting: startingOf(before, after),
    handing: handingOf(before, after),
    cleared: after.kind === 'sent' && before.kind !== 'sent',
    failure: failureOf(before, after),
  }
}
