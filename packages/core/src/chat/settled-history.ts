import type {ChatHistory} from '@conciv/protocol/chat-types'

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
