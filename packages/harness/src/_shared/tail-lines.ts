import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {TranscriptCursor, TranscriptPage} from '@conciv/protocol/harness-types'
import {open} from 'node:fs/promises'

const CHUNK_BYTES = 262_144
const NEWLINE = 0x0a

type TranscriptLine = {line: string; offset: number}

export async function* readLinesBackward(
  path: string,
  options: {end: number | null; signal?: AbortSignal},
): AsyncGenerator<TranscriptLine> {
  const file = await open(path, 'r')
  try {
    const size = (await file.stat()).size
    const carried: Buffer[] = []
    let position = Math.min(options.end ?? size, size)
    while (position > 0) {
      options.signal?.throwIfAborted()
      const start = Math.max(0, position - CHUNK_BYTES)
      const chunk = Buffer.allocUnsafe(position - start)
      const {bytesRead} = await file.read(chunk, 0, chunk.byteLength, start)
      if (bytesRead < chunk.byteLength) throw new Error(`${path} shrank while it was read`)
      let lineEnd = chunk.byteLength
      let newline = chunk.lastIndexOf(NEWLINE, lineEnd - 1)
      while (newline >= 0) {
        yield {
          line: Buffer.concat([chunk.subarray(newline + 1, lineEnd), ...carried]).toString('utf8'),
          offset: start + newline + 1,
        }
        carried.length = 0
        lineEnd = newline
        newline = lineEnd > 0 ? chunk.lastIndexOf(NEWLINE, lineEnd - 1) : -1
      }
      carried.unshift(chunk.subarray(0, lineEnd))
      position = start
    }
    options.signal?.throwIfAborted()
    yield {line: Buffer.concat(carried).toString('utf8'), offset: 0}
  } finally {
    await file.close()
  }
}

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
