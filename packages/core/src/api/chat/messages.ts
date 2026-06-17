import type {ContentPart, ModelMessage} from '@tanstack/ai'
import type {ChatMessage, ChatRequest} from '@opendui/aidx-protocol/chat-types'

// Text of one validated request message. Tolerant of both the parts-based UIMessage shape
// ({role, parts:[{type:'text', content}]}) and a plain {role, content: string}.
function messageText(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return m.content
      .filter((p) => p.type === 'text')
      .map((p) => p.content ?? '')
      .join('\n')
  }
  if (!m.parts) return ''
  return m.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.content ?? '')
    .join('\n')
}

// Build the ModelMessage content for one request message: a plain string, or a typed ContentPart[]
// (text + image) when the message carried inline content parts. Cast-free — each part is
// constructed as a typed ContentPart local before being collected.
function modelContent(m: ChatMessage): string | ContentPart[] {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return m.content.flatMap((p): ContentPart[] => {
      if (p.type === 'image' && p.source && p.source.type === 'data' && p.source.mimeType) {
        return [{type: 'image', source: {type: 'data', value: p.source.value, mimeType: p.source.mimeType}}]
      }
      if (p.type === 'text') return [{type: 'text', content: p.content ?? ''}]
      return []
    })
  }
  return messageText(m)
}

// Narrow the loose request role to a ModelMessage role (cast-free).
function modelRole(role: string): 'user' | 'assistant' | 'tool' {
  if (role === 'assistant') return 'assistant'
  if (role === 'tool') return 'tool'
  return 'user'
}

// Convert the loose validated request into typed ModelMessage[] for chat(). chat() accepts
// Array<UIMessage | ModelMessage>; producing ModelMessages keeps the conversion cast-free and
// lets the adapter read content (text + images) uniformly.
export function toChatMessages(req: ChatRequest): ModelMessage[] {
  return req.messages.map((m) => ({role: modelRole(m.role), content: modelContent(m)}))
}

// Pull the latest user-turn text from a validated chat request.
export function lastUserText(req: ChatRequest): string {
  const last = req.messages.filter((m) => m.role === 'user').at(-1)
  return last ? messageText(last) : ''
}
