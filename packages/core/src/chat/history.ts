import type {ContentPart, ModelMessage} from '@tanstack/ai'
import type {ChatHistory, ChatMessage} from '@conciv/protocol/chat-types'

type Part = {type: string; content?: unknown}
type HistoryMessage = {role: string; parts: ReadonlyArray<Part>}

export function userText(message: HistoryMessage): string {
  if (message.role !== 'user') return ''
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('\n')
}

export function settledMessages(messages: ChatHistory, pendingUserText: string | null): ChatHistory {
  if (pendingUserText === null) return messages
  const index = messages.findLastIndex((message) => userText(message as HistoryMessage) === pendingUserText)
  if (index === -1) return messages
  return messages.slice(0, index)
}

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

export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => ({role: modelRole(m.role), content: modelContent(m)}))
}
