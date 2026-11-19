import {Effect} from 'effect'
import type {Context} from '@conciv/plugin/experimental'
import {Recorder} from './rpc.js'
import {ExportFailed, type VideoPiece} from './panel.js'

export function saveFileToDisk(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function videoPieceReader(
  ctx: Context,
): (id: string, offset: number) => Effect.Effect<VideoPiece, ExportFailed> {
  return (id, offset) =>
    Effect.tryPromise({
      try: () => ctx.client.rpc(Recorder)['recordings.exportVideo']({id, offset}),
      catch: (cause) => ExportFailed.make({cause}),
    })
}
