import {WS_RPC_PAYLOAD_BUDGET_BYTES} from '@conciv/types/rpc-types'
import {readPromptPresentation} from '../composer/comment-note.js'
import type {EngineLock} from '../app/engine-login.js'
import {lockedMessage} from '../shell/engine-lock-messages.js'

const MAX_CONTENT_PARTS = 16

export type SendContent = string | {content: string | ReadonlyArray<unknown>; metadata?: unknown}

export type SendState = {busy: boolean; reachable: boolean; locked: EngineLock}

export type SendVerdict = {ok: true} | {ok: false; message: string | null; tone: 'info' | 'warn'}

function partCount(content: SendContent): number {
  if (typeof content === 'string') return content.trim().length > 0 ? 1 : 0
  if (typeof content.content === 'string') return content.content.trim().length > 0 ? 1 : 0
  return content.content.length
}

function attachmentCapCount(content: Exclude<SendContent, string>): number {
  const noted = (readPromptPresentation(content.metadata)?.comments.length ?? 0) > 0
  return partCount(content) - (noted && typeof content.content !== 'string' ? 1 : 0)
}

const MESSAGE_KEPT = 'Your message is still in the composer.'

export function checkSendState(state: SendState, unsent: string = MESSAGE_KEPT): SendVerdict {
  if (state.busy) return {ok: false, message: null, tone: 'info'}
  const locked = lockedMessage(state.locked)
  if (locked !== null) return {ok: false, message: locked, tone: 'warn'}
  if (!state.reachable) return {ok: false, message: `conciv lost connection to the engine. ${unsent}`, tone: 'warn'}
  return {ok: true}
}

export function checkSend(content: SendContent, state: SendState): SendVerdict {
  if (partCount(content) === 0) return {ok: false, message: null, tone: 'info'}
  const stateVerdict = checkSendState(state)
  if (!stateVerdict.ok) return stateVerdict
  if (typeof content !== 'string' && attachmentCapCount(content) > MAX_CONTENT_PARTS)
    return {ok: false, message: 'Too many attachments. Remove some and send again.', tone: 'warn'}
  if (new TextEncoder().encode(JSON.stringify(content)).length > WS_RPC_PAYLOAD_BUDGET_BYTES)
    return {
      ok: false,
      message: 'Message too large to send. Remove an attachment or shorten it.',
      tone: 'warn',
    }
  return {ok: true}
}
