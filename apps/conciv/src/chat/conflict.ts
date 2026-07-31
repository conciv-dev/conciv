import {sendBlockedMessage, sendConfirmMessage, sessionAttachedMessage} from './send-errors.js'

export type Conflict =
  | {kind: 'none'}
  | {kind: 'attached'; message: string}
  | {kind: 'taking-over'; message: string}
  | {kind: 'take-over-failed'; message: string; reason: string}
  | {kind: 'still-live'; message: string}
  | {kind: 'external'; message: string}
  | {kind: 'blocked'; message: string}

export const NO_CONFLICT: Conflict = {kind: 'none'}

export const TERMINAL_RECONNECTED = 'That terminal reconnected.'

export const ATTACHED_MESSAGE = 'This session is driven from your terminal.'

export function conflictFor(error: unknown): Conflict {
  const attached = sessionAttachedMessage(error)
  if (attached !== null) return {kind: 'attached', message: attached}
  const blocked = sendBlockedMessage(error)
  if (blocked !== null) return {kind: 'blocked', message: blocked}
  const confirm = sendConfirmMessage(error)
  if (confirm !== null) return {kind: 'external', message: confirm}
  return NO_CONFLICT
}

export function conflictAfterTakeOver(error: unknown): Conflict {
  const attached = sessionAttachedMessage(error)
  if (attached !== null) return {kind: 'take-over-failed', message: attached, reason: TERMINAL_RECONNECTED}
  const live = sendBlockedMessage(error) ?? sendConfirmMessage(error)
  if (live !== null) return {kind: 'still-live', message: live}
  return NO_CONFLICT
}
