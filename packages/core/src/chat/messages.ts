import type {ChatRequest} from '@devgent/protocol/chat-types'
import {isRecord} from './http.js'

// Pull the latest user-turn text from the posted messages. Tolerant of both the parts-based
// UIMessage shape ({role, parts:[{type:'text', content}]}) and a plain {role, content: string}
// model message, since the transport may send either.
export function lastUserText(req: ChatRequest): string {
  const users = req.messages.filter((m): m is Record<string, unknown> => isRecord(m) && m.role === 'user')
  const last = users.at(-1)
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  if (!Array.isArray(last.parts)) return ''
  return last.parts
    .filter((p): p is Record<string, unknown> => isRecord(p) && p.type === 'text' && typeof p.content === 'string')
    .map((p) => p.content)
    .join('\n')
}

export function isChatRequest(v: unknown): v is ChatRequest {
  return isRecord(v) && Array.isArray(v.messages)
}
