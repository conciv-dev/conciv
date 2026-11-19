import type {Router} from '@orpc/server'
import type {contract} from '@conciv/contract'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {decidePermissionCard} from '../../runtime/permission-cards.js'
import {os, type RpcDeps, type SessionOs} from './mount.js'

export function chatRouter(deps: RpcDeps, sessionOs: SessionOs): Router<typeof contract.chat, RpcContext> {
  return {
    events: os.chat.events.handler(({input, signal}) =>
      deps.runtime.forSession(input.sessionId).stream.events(signal ?? new AbortController().signal),
    ),
    send: os.chat.send.handler(({input, signal, lastEventId}) =>
      deps.chat.plane.send(
        {threadId: input.sessionId, runId: input.runId, messages: input.messages, lastEventId},
        signal,
      ),
    ),
    join: os.chat.join.handler(({input, signal, lastEventId}) =>
      deps.chat.plane.join({runId: input.runId, lastEventId: lastEventId ?? input.lastEventId}, signal),
    ),
    hydrate: os.chat.hydrate.handler(({input}) =>
      deps.runtime.forSession(input.sessionId).history.hydrate({limit: input.limit, before: input.before}),
    ),
    stop: os.chat.stop.handler(async ({input}) => {
      await deps.runtime.forSession(input.sessionId).run.stop(input.runIds)
      return {ok: true}
    }),
    permissionDecision: sessionOs.chat.permissionDecision.handler(async ({input, context, errors}) => {
      const decision = await decidePermissionCard(
        {
          plane: deps.chat.plane,
          answer: deps.answerPermission,
          publish: (sessionId, chunk) => deps.runtime.forSession(sessionId).stream.publish(chunk),
        },
        context.session.id,
        input,
      )
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
