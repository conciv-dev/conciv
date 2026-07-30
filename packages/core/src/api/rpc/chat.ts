import {writeReply} from '@conciv/db'
import {attachLive} from '../../chat/attach.js'
import {SESSION_BUSY} from '../../chat/run.js'
import {SESSION_ATTACHED} from '../../chat/adopt.js'
import {pendingUiCallIds, sessionForApproval} from '../../chat/gate.js'
import {os, type RpcDeps} from './mount.js'

type SendErrors = {BUSY: () => Error; SESSION_ATTACHED: () => Error}

function sendFailure(error: unknown, errors: SendErrors): unknown {
  if (!(error instanceof Error)) return error
  if (error.message === SESSION_BUSY) return errors.BUSY()
  if (error.message === SESSION_ATTACHED) return errors.SESSION_ATTACHED()
  return error
}

export function chatRouter(deps: RpcDeps) {
  const chat = deps.chat
  return {
    attach: os.chat.attach.handler(async function* ({input, signal}) {
      yield* attachLive(chat, input.sessionId, signal ?? new AbortController().signal)
    }),
    send: os.chat.send.handler(async ({input, errors}) => {
      const verdict = deps.beforeSend(input.sessionId, {force: input.force ?? false})
      if (!verdict.allow) throw errors.EXTERNAL_ACTIVE({message: verdict.message})
      const runId = await deps.send(input.sessionId, input.content ?? input.text ?? '').catch((error: unknown) => {
        throw sendFailure(error, errors)
      })
      return {ok: true as const, runId}
    }),
    permissionDecision: os.chat.permissionDecision.handler(({input}) => {
      const sessionId = sessionForApproval(chat.db, input.approvalId)
      if (sessionId !== null) {
        writeReply(chat.db, sessionId, input.approvalId, input.approved)
        chat.changes.notify()
      }
      return {ok: true as const}
    }),
    uiReply: os.chat.uiReply.handler(({input, errors}) => {
      if (!pendingUiCallIds(chat.db, input.sessionId).includes(input.toolCallId)) throw errors.UNKNOWN_REQUEST()
      writeReply(chat.db, input.sessionId, input.toolCallId, input.value)
      chat.changes.notify()
      return {ok: true as const}
    }),
  }
}
