import {EventType, type StreamChunk} from '@tanstack/ai'

type Coalesced = {
  kind: 'coalesced'
  start: StreamChunk
  text: string
  end: StreamChunk | null
  content: (text: string) => StreamChunk
}
type Raw = {kind: 'raw'; chunk: StreamChunk}
type Entry = Coalesced | Raw

export type RunView = {
  record: (chunk: StreamChunk) => void
  snapshot: () => StreamChunk[]
  reset: () => void
}

function textContent(messageId: string): (text: string) => StreamChunk {
  return (text) => ({type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text})
}

function reasoningContent(messageId: string): (text: string) => StreamChunk {
  return (text) => ({type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: text})
}

function toolArgsContent(toolCallId: string): (text: string) => StreamChunk {
  return (text) => ({type: EventType.TOOL_CALL_ARGS, toolCallId, delta: text})
}

export function makeRunView(): RunView {
  const entries: Entry[] = []
  const open = new Map<string, Coalesced>()

  function begin(key: string, start: StreamChunk, content: (text: string) => StreamChunk): void {
    const entry: Coalesced = {kind: 'coalesced', start, text: '', end: null, content}
    entries.push(entry)
    open.set(key, entry)
  }

  function append(key: string, delta: string, chunk: StreamChunk): void {
    const entry = open.get(key)
    if (!entry) return void entries.push({kind: 'raw', chunk})
    entry.text += delta
  }

  function close(key: string, chunk: StreamChunk): void {
    const entry = open.get(key)
    if (!entry) return void entries.push({kind: 'raw', chunk})
    entry.end = chunk
    open.delete(key)
  }

  function record(chunk: StreamChunk): void {
    if (chunk.type === EventType.TEXT_MESSAGE_START)
      return begin(`msg:${chunk.messageId}`, chunk, textContent(chunk.messageId))
    if (chunk.type === EventType.REASONING_MESSAGE_START)
      return begin(`msg:${chunk.messageId}`, chunk, reasoningContent(chunk.messageId))
    if (chunk.type === EventType.TOOL_CALL_START)
      return begin(`tool:${chunk.toolCallId}`, chunk, toolArgsContent(chunk.toolCallId))
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT || chunk.type === EventType.REASONING_MESSAGE_CONTENT)
      return append(`msg:${chunk.messageId}`, chunk.delta, chunk)
    if (chunk.type === EventType.TOOL_CALL_ARGS) return append(`tool:${chunk.toolCallId}`, chunk.delta, chunk)
    if (chunk.type === EventType.TEXT_MESSAGE_END || chunk.type === EventType.REASONING_MESSAGE_END)
      return close(`msg:${chunk.messageId}`, chunk)
    if (chunk.type === EventType.TOOL_CALL_END) return close(`tool:${chunk.toolCallId}`, chunk)
    entries.push({kind: 'raw', chunk})
  }

  function snapshot(): StreamChunk[] {
    const out: StreamChunk[] = []
    for (const entry of entries) {
      if (entry.kind === 'raw') {
        out.push(entry.chunk)
        continue
      }
      out.push(entry.start)
      if (entry.text) out.push(entry.content(entry.text))
      if (entry.end) out.push(entry.end)
    }
    return out
  }

  function reset(): void {
    entries.length = 0
    open.clear()
  }

  return {record, snapshot, reset}
}
