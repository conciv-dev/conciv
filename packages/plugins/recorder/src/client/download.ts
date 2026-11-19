import type {Context} from '@conciv/plugin/experimental'
import {Recorder} from '../rpc.js'

export function saveFileToDisk(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
}

export function readRecordingVideo(ctx: Context, clientId: string, id: string): Promise<File> {
  const read = async (offset: number, parts: Uint8Array<ArrayBuffer>[]): Promise<File> => {
    const piece = await ctx.client.rpc(Recorder)['recordings.exportVideo']({clientId, id, offset})
    const bytes = base64Bytes(piece.data)
    if (piece.eof) return new File([...parts, bytes], piece.name, {type: piece.mime})
    return read(offset + bytes.length, [...parts, bytes])
  }
  return read(0, [])
}
