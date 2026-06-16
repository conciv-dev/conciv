// Chat session + history client against @aidx/core's /api/chat* routes. On resume the
// widget hydrates the thread from the prior session. Identity travels in the AIDX_SESSION_HEADER
// on every request, so one ChatApi instance is bound to one session id.
import type {UIMessage} from '@tanstack/ai-client'
import {
  ChatSessionSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatLaunchSchema,
  ChatSessionsSchema,
  AIDX_SESSION_HEADER,
  type ChatSession,
  type ChatModels,
  type ChatLaunch,
  type ChatSessionMeta,
} from '@aidx/protocol/chat-types'

// The list fetch's outcome: 'unsupported' (no transcript harness → hide the selector), 'error'
// (transient → offer Retry), or 'ok'.
export type SessionsResult = {status: 'ok' | 'unsupported' | 'error'; sessions: ChatSessionMeta[]}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function resolveBase(apiBase?: string): string {
  return (apiBase ?? metaContent('pw-api-base')).replace(/\/+$/, '')
}

// Is the chat backend present? The widget can load on a server WITHOUT aidx routes
// (then /api/chat/session 404s); probe it so we only mount the chat UI + page-bus when the
// backend answers, instead of a dead FAB and a retrying EventSource.
export async function probeChatAvailable(apiBase?: string): Promise<boolean> {
  const base = resolveBase(apiBase)
  try {
    const res = await fetch(`${base}/api/chat/session`, {credentials: 'include'})
    return res.ok
  } catch {
    return false
  }
}

export type ChatApi = {
  base: string
  chatUrl: string
  sessionHeaders: () => Record<string, string>
  session: () => Promise<ChatSession>
  models: () => Promise<ChatModels>
  history: () => Promise<UIMessage[]>
  sessions: () => Promise<SessionsResult>
  renameSession: (sessionId: string, title: string) => Promise<string>
  newSession: () => Promise<Response>
  deleteSession: () => Promise<Response>
  launch: (req?: {model?: string}) => Promise<ChatLaunch>
  permissionDecision: (renderId: string, approved: boolean) => Promise<Response>
}

export function createChatApi(deps: {apiBase?: string; sessionId?: () => string | undefined} = {}): ChatApi {
  const base = resolveBase(deps.apiBase)
  // Read the id live each request so a session SWITCH (the modal/pane changing its sessionId) routes
  // subsequent calls to the new session without recreating the api.
  const sessionHeaders = (): Record<string, string> => {
    const id = deps.sessionId?.()
    return id ? {[AIDX_SESSION_HEADER]: id} : {}
  }
  return {
    base,
    chatUrl: `${base}/api/chat`,
    sessionHeaders,
    session: async () => {
      const res = await fetch(`${base}/api/chat/session`, {credentials: 'include', headers: sessionHeaders()})
      return ChatSessionSchema.parse(await res.json())
    },
    models: async () => {
      const res = await fetch(`${base}/api/chat/models`, {credentials: 'include'})
      return ChatModelsSchema.parse(await res.json())
    },
    history: async () => {
      const res = await fetch(`${base}/api/chat/history`, {credentials: 'include', headers: sessionHeaders()})
      return ChatHistorySchema.parse(await res.json())
    },
    // The cwd's sessions for the selector. 404 → harness has no transcript list (hide the selector).
    sessions: async () => {
      try {
        const res = await fetch(`${base}/api/chat/sessions`, {credentials: 'include'})
        if (res.status === 404) return {status: 'unsupported', sessions: []}
        if (!res.ok) return {status: 'error', sessions: []}
        return {status: 'ok', sessions: ChatSessionsSchema.parse(await res.json()).sessions}
      } catch {
        return {status: 'error', sessions: []}
      }
    },
    // Set a session's user title; returns the server-sanitized title actually stored.
    renameSession: async (sessionId: string, title: string) => {
      const res = await fetch(`${base}/api/chat/sessions/title`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({sessionId, title}),
      })
      if (!res.ok) throw new Error('rename failed')
      const body: unknown = await res.json()
      const t = (body as {title?: unknown}).title
      return typeof t === 'string' ? t : title
    },
    // Forget the resume pointer so the next turn starts a fresh session (server-side reset).
    newSession: () =>
      fetch(`${base}/api/chat/session/new`, {method: 'POST', credentials: 'include', headers: sessionHeaders()}),
    // Forget a session entirely (a pane closed): kill its live turn + drop its persisted token.
    deleteSession: () =>
      fetch(`${base}/api/chat/session`, {method: 'DELETE', credentials: 'include', headers: sessionHeaders()}),
    // Open the current session in the harness's own CLI (server-side); falls back to a copy-able command.
    launch: async (req = {}) => {
      const res = await fetch(`${base}/api/chat/launch`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...sessionHeaders()},
        body: JSON.stringify({model: req.model}),
      })
      return ChatLaunchSchema.parse(await res.json())
    },
    // Answer the risky-Bash gate's blocking confirm (unblocks the PreToolUse hook).
    permissionDecision: (renderId: string, approved: boolean) =>
      fetch(`${base}/api/chat/permission-decision`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...sessionHeaders()},
        body: JSON.stringify({renderId, approved}),
      }),
  }
}
