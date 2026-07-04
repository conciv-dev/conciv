import {EventType, type StreamChunk} from '@tanstack/ai'

type Coalesced = {
  kind: 'coalesced'
  start: StreamChunk
  messageId: string
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

export function makeRunView(): RunView {
  const entries: Entry[] = []
  const open = new Map<string, Coalesced>()

  function begin(chunk: StreamChunk, messageId: string, content: (text: string) => StreamChunk): void {
    const entry: Coalesced = {kind: 'coalesced', start: chunk, messageId, text: '', end: null, content}
    entries.push(entry)
    open.set(messageId, entry)
  }

  function record(chunk: StreamChunk): void {
    if (chunk.type === EventType.TEXT_MESSAGE_START) return begin(chunk, chunk.messageId, textContent(chunk.messageId))
    if (chunk.type === EventType.REASONING_MESSAGE_START)
      return begin(chunk, chunk.messageId, reasoningContent(chunk.messageId))
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT || chunk.type === EventType.REASONING_MESSAGE_CONTENT) {
      const entry = open.get(chunk.messageId)
      if (!entry) return void entries.push({kind: 'raw', chunk})
      entry.text += chunk.delta
      return
    }
    if (chunk.type === EventType.TEXT_MESSAGE_END || chunk.type === EventType.REASONING_MESSAGE_END) {
      const entry = open.get(chunk.messageId)
      if (!entry) return void entries.push({kind: 'raw', chunk})
      entry.end = chunk
      open.delete(chunk.messageId)
      return
    }
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
