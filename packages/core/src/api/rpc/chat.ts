import {writeReply} from '@conciv/db'
import {attachLive} from '../../chat/attach.js'
import {SESSION_BUSY} from '../../chat/run.js'
import {pendingUiCallIds, sessionForApproval} from '../../chat/gate.js'
import {os, type RpcDeps} from './mount.js'

export function chatRouter(deps: RpcDeps) {
  const chat = deps.chat
  return {
    attach: os.chat.attach.handler(async function* ({input, signal}) {
      yield* attachLive(chat, input.sessionId, signal ?? new AbortController().signal)
    }),
    send: os.chat.send.handler(async ({input, errors}) => {
      try {
        await deps.send(input.sessionId, input.text)
      } catch (error) {
        if (error instanceof Error && error.message === SESSION_BUSY) throw errors.BUSY()
        throw error
      }
      return {ok: true as const}
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
