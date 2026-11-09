import {open, type FileHandle} from 'node:fs/promises'

const CHUNK_BYTES = 262_144
const NEWLINE = 0x0a

export async function foldJsonlFile<State>(
  path: string,
  initial: State,
  foldLine: (state: State, line: string, offset: number) => State,
): Promise<State> {
  const progress = {state: initial}
  for await (const {line, offset} of readLinesForward(path)) progress.state = foldLine(progress.state, line, offset)
  return progress.state
}

async function* readLinesForward(path: string): AsyncGenerator<{line: string; offset: number}> {
  const file = await open(path, 'r')
  try {
    const carried: Buffer[] = []
    let lineStart = 0
    let position = 0
    let chunk = await readChunk(file, position)
    while (chunk.byteLength > 0) {
      let from = 0
      let newline = chunk.indexOf(NEWLINE, from)
      while (newline >= 0) {
        yield {line: Buffer.concat([...carried, chunk.subarray(from, newline)]).toString('utf8'), offset: lineStart}
        carried.length = 0
        lineStart = position + newline + 1
        from = newline + 1
        newline = chunk.indexOf(NEWLINE, from)
      }
      carried.push(chunk.subarray(from))
      position += chunk.byteLength
      chunk = await readChunk(file, position)
    }
    yield {line: Buffer.concat(carried).toString('utf8'), offset: lineStart}
  } finally {
    await file.close()
  }
}

async function readChunk(file: FileHandle, position: number): Promise<Buffer> {
  const chunk = Buffer.allocUnsafe(CHUNK_BYTES)
  const {bytesRead} = await file.read(chunk, 0, CHUNK_BYTES, position)
  return chunk.subarray(0, bytesRead)
}
