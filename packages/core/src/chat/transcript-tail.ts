import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {TranscriptTailEntry} from '@conciv/contract'

export const TRANSCRIPT_TAIL_LIMIT = 6

const MAX_TEXT = 400

function condense(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

function textOf(parts: MessagePart[]): string {
  return condense(parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' '))
}

function resultsById(parts: MessagePart[]): Map<string, string> {
  const found = new Map<string, string>()
  for (const part of parts) {
    if (part.type !== 'tool-result') continue
    found.set(part.toolCallId, condense(typeof part.content === 'string' ? part.content : ''))
  }
  return found
}

function entriesOf(message: UIMessage): TranscriptTailEntry[] {
  if (message.role === 'user') {
    const text = textOf(message.parts)
    return text ? [{role: 'user', text}] : []
  }
  if (message.role !== 'assistant') return []
  const results = resultsById(message.parts)
  const out: TranscriptTailEntry[] = []
  const spoken = textOf(message.parts)
  if (spoken) out.push({role: 'assistant', text: spoken})
  for (const part of message.parts) {
    if (part.type !== 'tool-call') continue
    const result = results.get(part.id)
    out.push({role: 'tool', text: '', toolName: part.name, ...(result ? {toolResult: result} : {})})
  }
  return out
}

export function transcriptTail(messages: UIMessage[], limit = TRANSCRIPT_TAIL_LIMIT): TranscriptTailEntry[] {
  return messages.flatMap(entriesOf).slice(-limit)
}
