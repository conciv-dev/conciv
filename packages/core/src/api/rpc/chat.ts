import {os, type RpcDeps, type SessionOs} from './mount.js'

export function chatRouter(deps: RpcDeps, sessionOs: SessionOs) {
  return {
    events: os.chat.events.handler(({input, signal}) =>
      deps.runtime.forSession(input.sessionId).stream.events(signal ?? new AbortController().signal),
    ),
    hydrate: os.chat.hydrate.handler(({input}) => deps.runtime.forSession(input.sessionId).history.hydrate()),
    stop: os.chat.stop.handler(({input}) => deps.runtime.forSession(input.sessionId).run.stop()),
    permissionDecision: sessionOs.chat.permissionDecision.handler(({input, errors}) => {
      const owner = deps.chat.asks.owner(input.approvalId)
      if (owner === null) throw errors.UNKNOWN_REQUEST()
      if (input.approved && input.scope === 'session') deps.chat.commandMemory.remember(owner, input.approvalId)
      if (!deps.runtime.forSession(owner).asks.reply(input.approvalId, input.approved)) {
        throw errors.UNKNOWN_REQUEST()
      }
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
