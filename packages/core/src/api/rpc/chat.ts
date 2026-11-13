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
    hydrate: os.chat.hydrate.handler(({input}) =>
      deps.runtime.forSession(input.sessionId).history.hydrate({limit: input.limit, before: input.before}),
    ),
    stop: os.chat.stop.handler(({input}) => deps.runtime.forSession(input.sessionId).run.stop(input.runIds)),
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
    outsideAccess: os.chat.outsideAccess.handler(async ({input}) => ({
      denied: await deps.chat.plane.outsideDenied(input.sessionId),
    })),
    allowOutside: os.chat.allowOutside.handler(async ({input}) => {
      await deps.chat.plane.allowOutside(input.sessionId)
      return {ok: true as const}
    }),
    uiReply: os.chat.uiReply.handler(({input, errors}) => {
      if (!deps.chat.plane.answerUi(input.sessionId, input.toolCallId, input.value)) {
        throw errors.UNKNOWN_REQUEST()
      }
      return {ok: true as const}
    }),
  }
}
