import {ORPCError} from '@orpc/server'
import {isRunIdReusedError} from '../../chat/run.js'
import {stopSession} from '../../chat/stop.js'
import {subscribeSession} from '../../chat/subscribe.js'
import {os, type RpcDeps} from './mount.js'

export function chatRouter(deps: RpcDeps) {
  const chat = deps.chat
  return {
    subscribe: os.chat.subscribe.handler(async function* ({input, signal}) {
      yield* subscribeSession(chat, input.sessionId, signal ?? new AbortController().signal)
    }),
    send: os.chat.send.handler(async ({input}) => {
      const runId = await deps
        .send(input.sessionId, input.runId, input.content ?? input.text ?? '')
        .catch((error: unknown) => {
          if (isRunIdReusedError(error)) throw new ORPCError('CONFLICT', {message: error.message})
          throw error
        })
      return {ok: true as const, runId}
    }),
    stop: os.chat.stop.handler(({input}) => stopSession(chat, input.sessionId)),
    permissionDecision: os.chat.permissionDecision.handler(({input}) => {
      const sessionId = chat.asks.owner(input.approvalId)
      if (sessionId !== null) chat.asks.reply(sessionId, input.approvalId, input.approved)
      return {ok: true as const}
    }),
    uiReply: os.chat.uiReply.handler(({input, errors}) => {
      if (!chat.asks.reply(input.sessionId, input.toolCallId, input.value)) throw errors.UNKNOWN_REQUEST()
      return {ok: true as const}
    }),
  }
}
