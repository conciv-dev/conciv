// Chat session + history client against @aidx/core's /api/chat* routes. On resume the
// widget hydrates the thread from the prior session.
import type {UIMessage} from '@tanstack/ai-client'
import {ChatSessionSchema, ChatHistorySchema, ChatModelsSchema, ChatLaunchSchema, type ChatSession, type ChatModels, type ChatLaunch} from '@aidx/protocol/chat-types'

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
  session: () => Promise<ChatSession>
  models: () => Promise<ChatModels>
  history: (sessionId: string) => Promise<UIMessage[]>
  newSession: () => Promise<Response>
  launch: (req?: {model?: string}) => Promise<ChatLaunch>
  permissionDecision: (renderId: string, approved: boolean) => Promise<Response>
}

export function createChatApi(deps: {apiBase?: string} = {}): ChatApi {
  const base = resolveBase(deps.apiBase)
  return {
    base,
    chatUrl: `${base}/api/chat`,
    session: async () => {
      const res = await fetch(`${base}/api/chat/session`, {credentials: 'include'})
      return ChatSessionSchema.parse(await res.json())
    },
    models: async () => {
      const res = await fetch(`${base}/api/chat/models`, {credentials: 'include'})
      return ChatModelsSchema.parse(await res.json())
    },
    history: async (sessionId: string) => {
      const res = await fetch(`${base}/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: 'include',
      })
      return ChatHistorySchema.parse(await res.json())
    },
    // Forget the resume pointer so the next turn starts a fresh session (server-side reset).
    newSession: () => fetch(`${base}/api/chat/session/new`, {method: 'POST', credentials: 'include'}),
    // Open the current session in the harness's own CLI (server-side); falls back to a copy-able command.
    launch: async (req = {}) => {
      const res = await fetch(`${base}/api/chat/launch`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({model: req.model}),
      })
      return ChatLaunchSchema.parse(await res.json())
    },
    // Answer the risky-Bash gate's blocking confirm (unblocks the PreToolUse hook).
    permissionDecision: (renderId: string, approved: boolean) =>
      fetch(`${base}/api/chat/permission-decision`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({renderId, approved}),
      }),
  }
}
