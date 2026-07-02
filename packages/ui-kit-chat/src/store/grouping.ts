import type {MessagePart, ToolResultPart, UIMessage} from '@tanstack/ai-client'

export type Turn = {key: string; role: UIMessage['role']; parts: MessagePart[]; start: number; end: number}

export function coalesceTurns(messages: ReadonlyArray<UIMessage>): Turn[] {
  return messages.reduce<Turn[]>((turns, message, index) => {
    const last = turns.at(-1)
    if (message.role === 'assistant' && last?.role === 'assistant') {
      return [...turns.slice(0, -1), {...last, parts: [...last.parts, ...message.parts], end: index}]
    }
    return [...turns, {key: message.id, role: message.role, parts: [...message.parts], start: index, end: index}]
  }, [])
}

export type ChainSegment = {kind: 'chain'; indices: number[]}
export type ReplySegment = {kind: 'reply'; index: number}
export type Segment = ChainSegment | ReplySegment

const isReplyText = (part: MessagePart): boolean => part.type === 'text' && part.content.trim().length > 0

export function groupSegments(parts: ReadonlyArray<MessagePart>): Segment[] {
  return parts.reduce<Segment[]>((segments, part, index) => {
    if (isReplyText(part)) return [...segments, {kind: 'reply', index}]
    const last = segments.at(-1)
    return last?.kind === 'chain'
      ? [...segments.slice(0, -1), {kind: 'chain', indices: [...last.indices, index]}]
      : [...segments, {kind: 'chain', indices: [index]}]
  }, [])
}

export type ResultPairing = {byCallId: Map<string, ToolResultPart>; hiddenResultIds: Set<string>}

export function pairResults(parts: ReadonlyArray<MessagePart>): ResultPairing {
  const callIds = new Set<string>()
  for (const part of parts) if (part.type === 'tool-call' && part.id) callIds.add(part.id)
  const byCallId = new Map<string, ToolResultPart>()
  const hiddenResultIds = new Set<string>()
  for (const part of parts) {
    if (part.type !== 'tool-result' || !part.toolCallId) continue
    byCallId.set(part.toolCallId, part)
    if (callIds.has(part.toolCallId)) hiddenResultIds.add(part.toolCallId)
  }
  return {byCallId, hiddenResultIds}
}
