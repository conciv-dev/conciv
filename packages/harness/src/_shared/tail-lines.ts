import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {TranscriptCursor, TranscriptPage} from '@conciv/protocol/harness-types'
import {readLinesBackward} from './read-lines-backward.js'

type ScannedLine<Line> = {line: Line; boundary: boolean; first: boolean}

export async function tailLines<Line>(source: {
  path: string
  end: number | null
  limit: number
  signal?: AbortSignal
  scan: (line: string, offset: number) => ScannedLine<Line> | null
  fold: (lines: Line[]) => ChatMessage[]
  cursor: (line: Line, offset: number) => TranscriptCursor
}): Promise<TranscriptPage> {
  const segment: Line[] = []
  const page: {messages: ChatMessage[]} = {messages: []}
  for await (const {line, offset} of readLinesBackward(source.path, {end: source.end, signal: source.signal})) {
    const scanned = source.scan(line, offset)
    if (scanned === null) continue
    segment.push(scanned.line)
    if (scanned.first) break
    if (!scanned.boundary) continue
    page.messages = [...source.fold(segment.splice(0).toReversed()), ...page.messages]
    if (page.messages.length >= source.limit && offset > 0) {
      return {messages: page.messages, earlier: source.cursor(scanned.line, offset)}
    }
  }
  return {messages: [...source.fold(segment.toReversed()), ...page.messages], earlier: null}
}
