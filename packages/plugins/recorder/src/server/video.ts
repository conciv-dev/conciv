import {randomUUID} from 'node:crypto'
import {open, rename, stat, unlink, writeFile} from 'node:fs/promises'
import type {RrwebEvent} from '../shared/protocol.js'
import type {KeyframeRenderer} from './render.js'

export type VideoPiece = {data: string; eof: boolean}

type UseRenderer = <Result>(work: (renderer: KeyframeRenderer) => Promise<Result>) => Promise<Result | null>

export async function renderedVideo(file: string, events: RrwebEvent[], useRenderer: UseRenderer): Promise<boolean> {
  const existing = await stat(file).catch(() => null)
  if (existing?.isFile()) return true
  const video = await useRenderer((renderer) => renderer.renderVideo(events))
  if (!video) return false
  const temporary = `${file}.${randomUUID()}.tmp`
  return writeFile(temporary, video)
    .then(() => rename(temporary, file))
    .then(
      () => true,
      () =>
        unlink(temporary).then(
          () => false,
          () => false,
        ),
    )
}

export async function readVideoPiece(file: string, offset: number, maxBytes: number): Promise<VideoPiece> {
  const handle = await open(file, 'r')
  try {
    const {size} = await handle.stat()
    const length = Math.max(0, Math.min(maxBytes, size - offset))
    const buffer = Buffer.alloc(length)
    const {bytesRead} = length > 0 ? await handle.read(buffer, 0, length, offset) : {bytesRead: 0}
    return {data: buffer.subarray(0, bytesRead).toString('base64'), eof: offset + bytesRead >= size}
  } finally {
    await handle.close()
  }
}
