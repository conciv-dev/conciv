import {isRunIdTakenError} from '../../chat/run.js'
import {os, type RpcDeps, type SessionOs} from './mount.js'

export function chatRouter(deps: RpcDeps, sessionOs: SessionOs) {
  return {
    subscribe: os.chat.subscribe.handler(({input, signal}) =>
      deps.runtime.forSession(input.sessionId).stream.subscribe(signal ?? new AbortController().signal),
    ),
    send: os.chat.send.handler(async ({input, errors}) => {
      const runId = await deps.runtime
        .forSession(input.sessionId)
        .run.send(input.runId, input.content ?? input.text ?? '')
        .catch((error: unknown) => {
          if (isRunIdTakenError(error)) {
            throw errors.RUN_ID_TAKEN({message: error.message, data: {runId: input.runId}})
          }
          throw error
        })
      return {ok: true as const, runId}
    }),
    stop: os.chat.stop.handler(({input}) => deps.runtime.forSession(input.sessionId).run.stop()),
    permissionDecision: sessionOs.chat.permissionDecision.handler(({input, context}) => {
      context.session.asks.reply(input.approvalId, input.approved)
      return {ok: true as const}
    }),
    uiReply: os.chat.uiReply.handler(({input, errors}) => {
      if (!deps.runtime.forSession(input.sessionId).asks.reply(input.toolCallId, input.value)) {
        throw errors.UNKNOWN_REQUEST()
      }
      return {ok: true as const}
    }),
  }
}
