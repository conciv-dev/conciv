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
