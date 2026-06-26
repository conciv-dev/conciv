// A per-instance session client over the shared transport. The modal and each quick-terminal pane
// own one; it carries this instance's branded SessionId on every request. The single comms seam —
// only our mandarax_ id ever reaches the wire (resolve is the one route that takes a non-ours id, via body).
import {createSignal} from 'solid-js'
import {
  MANDARAX_SESSION_HEADER,
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
} from '@mandarax/protocol/chat-types'
import {createTransport} from './transport.js'

export function defineClient(opts: {apiBase: string}) {
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null)
  // Only our branded id ever reaches the wire; null (not yet resolved) attaches no header.
  const sessionHeaders = (): Record<string, string> => {
    const id = sessionId()
    return id ? {[MANDARAX_SESSION_HEADER]: id} : {}
  }
  const t = createTransport({apiBase: opts.apiBase, headers: sessionHeaders})
  return {
    sessionId,
    setSessionId,
    // The AG-UI chat stream transport reads these (POST SSE handled by @tanstack/ai-client).
    chatStreamUrl: () => t.url('/api/chat'),
    chatHeaders: sessionHeaders,
    // Every session-scoped request/response route lives here, inferred from the shared schemas.
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
