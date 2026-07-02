import {createSignal} from 'solid-js'
import {
  CONCIV_SESSION_HEADER,
  type SessionId,
  ChatSessionSchema,
  ChatSessionsSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatLaunchSchema,
  ChatLaunchRequestSchema,
  RenameSessionSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  RenameResponseSchema,
  OkSchema,
  PermissionDecisionSchema,
} from '@conciv/protocol/chat-types'
import {createTransport} from './transport.js'

export function defineClient(opts: {apiBase: string}) {
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null)

  const sessionHeaders = (): Record<string, string> => {
    const id = sessionId()
    return id ? {[CONCIV_SESSION_HEADER]: id} : {}
  }
  const t = createTransport({apiBase: opts.apiBase, headers: sessionHeaders})
  return {
    sessionId,
    setSessionId,

    chatStreamUrl: () => t.url('/api/chat'),
    chatHeaders: sessionHeaders,

    resolve: t.route({
      method: 'POST',
      path: '/api/chat/session/resolve',
      request: ResolveRequestSchema,
      response: ResolveResponseSchema,
    }),
    session: t.route({method: 'GET', path: '/api/chat/session', response: ChatSessionSchema}),
    sessions: t.route({method: 'GET', path: '/api/chat/sessions', response: ChatSessionsSchema}),
    history: t.route({method: 'GET', path: '/api/chat/history', response: ChatHistorySchema}),
    models: t.route({method: 'GET', path: '/api/chat/models', response: ChatModelsSchema}),
    rename: t.route({
      method: 'POST',
      path: '/api/chat/sessions/title',
      request: RenameSessionSchema,
      response: RenameResponseSchema,
    }),
    launch: t.route({
      method: 'POST',
      path: '/api/chat/launch',
      request: ChatLaunchRequestSchema,
      response: ChatLaunchSchema,
    }),
    remove: t.route({method: 'DELETE', path: '/api/chat/session', response: OkSchema}),
    permissionDecision: t.route({
      method: 'POST',
      path: '/api/chat/permission-decision',
      request: PermissionDecisionSchema,
      response: OkSchema,
    }),
  }
}

export type SessionClient = ReturnType<typeof defineClient>

export {createTransport, apiError} from './transport.js'
export type {ApiError} from './transport.js'

export type RequestMeta = Record<string, unknown>
