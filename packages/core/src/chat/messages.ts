import type {ContentPart, ModelMessage, UIMessage} from '@tanstack/ai'
import type {ChatMessage, ChatRequest} from '@conciv/protocol/chat-types'

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

function modelRole(role: string): 'user' | 'assistant' | 'tool' {
  if (role === 'assistant') return 'assistant'
  if (role === 'tool') return 'tool'
  return 'user'
}

export function toChatMessages(req: ChatRequest): ModelMessage[] {
  return req.messages.map((m) => ({role: modelRole(m.role), content: modelContent(m)}))
}

export function lastUserText(req: ChatRequest): string {
  const last = req.messages.filter((m) => m.role === 'user').at(-1)
  return last ? messageText(last) : ''
}

export function toPendingUserMessage(message: ChatMessage): UIMessage {
  const id = 'id' in message && typeof message.id === 'string' ? message.id : 'conciv-pending-user'
  return {id, role: 'user', parts: [{type: 'text', content: messageText(message)}]}
}
