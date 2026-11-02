import {z} from 'zod'
import {
  ChatHydrationSchema,
  ChatPermissionDecisionOutputSchema,
  ChatStopInputSchema,
  ChatUiReplyInputSchema,
  chatPermissionDecisionErrors,
  chatUiReplyErrors,
  OkSchema,
  SessionIdInputSchema,
} from '@conciv/contract'
import {concivError, defineConcivFunction} from '@conciv/extension/devframe-function'
import {PermissionDecisionSchema, type PermissionDecision, type SessionId} from '@conciv/protocol/chat-types'
import type {ServerFunctionsOf} from '../../devframe-plane.js'
import {definedErrors, os, type RpcDeps, type SessionOs} from './mount.js'

type ChatDeps = Pick<RpcDeps, 'chat' | 'runtime'>

function chatActions(deps: ChatDeps) {
  return {
    hydrate: (input: z.infer<typeof SessionIdInputSchema>) =>
      deps.runtime.forSession(input.sessionId).history.hydrate(),
    stop: (input: z.infer<typeof ChatStopInputSchema>) =>
      deps.runtime.forSession(input.sessionId).run.stop(input.runIds),
    permissionDecision: async (sessionId: SessionId, input: PermissionDecision) => {
      const decision = await deps.chat.plane.decide(sessionId, input.approvalId, input.approved, input.scope)
      if (decision === null) {
        throw concivError('UNKNOWN_REQUEST', chatPermissionDecisionErrors.UNKNOWN_REQUEST.message)
      }
      return {ok: true as const, startsTurn: decision.startsTurn}
    },
    uiReply: async (input: z.infer<typeof ChatUiReplyInputSchema>) => {
      if (!deps.chat.plane.answerUi(input.sessionId, input.toolCallId, input.value)) {
        throw concivError('UNKNOWN_REQUEST', chatUiReplyErrors.UNKNOWN_REQUEST.message)
      }
      return {ok: true as const}
    },
  }
}

export function chatRouter(deps: RpcDeps, sessionOs: SessionOs) {
  const actions = chatActions(deps)
  return {
    events: os.chat.events.handler(({input, signal}) =>
      deps.runtime.forSession(input.sessionId).stream.events(signal ?? new AbortController().signal),
    ),
    hydrate: os.chat.hydrate.handler(({input}) => actions.hydrate(input)),
    stop: os.chat.stop.handler(({input}) => actions.stop(input)),
    permissionDecision: sessionOs.chat.permissionDecision.handler(({input, context, errors}) =>
      definedErrors(actions.permissionDecision(context.session.id, input), errors),
    ),
    uiReply: os.chat.uiReply.handler(({input, errors}) => definedErrors(actions.uiReply(input), errors)),
  }
}

export function chatFunctions(deps: ChatDeps) {
  const actions = chatActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:chat:hydrate',
      type: 'query',
      input: SessionIdInputSchema,
      output: ChatHydrationSchema,
      handler: actions.hydrate,
    }),
    defineConcivFunction({
      name: 'conciv:chat:stop',
      type: 'action',
      input: ChatStopInputSchema,
      output: OkSchema,
      handler: actions.stop,
    }),
    defineConcivFunction({
      name: 'conciv:chat:permissionDecision',
      type: 'action',
      session: true,
      input: PermissionDecisionSchema,
      output: ChatPermissionDecisionOutputSchema,
      handler: (input, call) => actions.permissionDecision(call.sessionId, input),
    }),
    defineConcivFunction({
      name: 'conciv:chat:uiReply',
      type: 'action',
      input: ChatUiReplyInputSchema,
      output: OkSchema,
      handler: actions.uiReply,
    }),
  ]
}

export type ChatServerFunctions = ServerFunctionsOf<ReturnType<typeof chatFunctions>>
