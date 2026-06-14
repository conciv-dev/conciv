import type {ModelMessage} from '@tanstack/ai'
import type {ChatMessage, ChatRequest} from '@aidx/protocol/chat-types'

// Text of one validated request message. Tolerant of both the parts-based UIMessage shape
// ({role, parts:[{type:'text', content}]}) and a plain {role, content: string}.
function messageText(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  if (!m.parts) return ''
  return m.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.content ?? '')
    .join('\n')
}

// Narrow the loose request role to a ModelMessage role (cast-free).
function modelRole(role: string): 'user' | 'assistant' | 'tool' {
  if (role === 'assistant') return 'assistant'
  if (role === 'tool') return 'tool'
  return 'user'
}

// Convert the loose validated request into typed ModelMessage[] for chat(). chat() accepts
// Array<UIMessage | ModelMessage>; producing ModelMessages keeps the conversion cast-free and
// lets the adapter read content uniformly.
export function toChatMessages(req: ChatRequest): ModelMessage[] {
  return req.messages.map((m) => ({role: modelRole(m.role), content: messageText(m)}))
}

// Pull the latest user-turn text from a validated chat request.
export function lastUserText(req: ChatRequest): string {
  const last = req.messages.filter((m) => m.role === 'user').at(-1)
  return last ? messageText(last) : ''
}
