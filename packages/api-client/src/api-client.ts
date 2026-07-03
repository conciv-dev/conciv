import {createSignal} from 'solid-js'
import {
  CONCIV_SESSION_HEADER,
  type SessionId,
  ChatSessionSchema,
  ChatSessionsSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatCommandsSchema,
  ChatToolsSchema,
  ChatLaunchSchema,
  ChatLaunchRequestSchema,
  RenameSessionSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  RenameResponseSchema,
  OkSchema,
  PermissionDecisionSchema,
} from '@conciv/protocol/chat-types'
import {SetModeRequestSchema, SetModeResponseSchema} from '@conciv/protocol/terminal-types'
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
    commands: t.route({method: 'GET', path: '/api/chat/commands', response: ChatCommandsSchema}),
    tools: t.route({method: 'GET', path: '/api/chat/tools', response: ChatToolsSchema}),
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
    mode: t.route({method: 'GET', path: '/api/chat/mode', response: SetModeResponseSchema}),
    setMode: t.route({
      method: 'POST',
      path: '/api/chat/mode',
      request: SetModeRequestSchema,
      response: SetModeResponseSchema,
    }),
    ttyUrl: (cols: number, rows: number) => {
      const id = sessionId()
      const url = new URL(t.url(`/api/tty?session=${id ?? ''}&cols=${cols}&rows=${rows}`), window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return url.toString()
    },
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
