import {os, type RpcDeps, type SessionOs} from './mount.js'

export function chatRouter(deps: RpcDeps, sessionOs: SessionOs) {
  return {
    events: os.chat.events.handler(({input, signal}) =>
      deps.runtime.forSession(input.sessionId).stream.events(signal ?? new AbortController().signal),
    ),
    hydrate: os.chat.hydrate.handler(({input}) => deps.runtime.forSession(input.sessionId).history.hydrate()),
    stop: os.chat.stop.handler(({input}) => deps.runtime.forSession(input.sessionId).run.stop(input.runIds)),
    permissionDecision: sessionOs.chat.permissionDecision.handler(async ({input, context, errors}) => {
      const decision = await deps.chat.plane.decide(context.session.id, input.approvalId, input.approved, input.scope)
      if (decision === null) throw errors.UNKNOWN_REQUEST()
      return {ok: true as const, startsTurn: decision.startsTurn}
    }),
    uiReply: os.chat.uiReply.handler(({input, errors}) => {
      if (!deps.chat.plane.answerUi(input.sessionId, input.toolCallId, input.value)) {
        throw errors.UNKNOWN_REQUEST()
      }
      return {ok: true as const}
    }),
  }
}
