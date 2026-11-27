import {Effect} from 'effect'
import type {EvlogError} from 'evlog'
import type {VideoPiece} from './panel.js'
import {causeOverrides, recorderErrors} from './errors/errors.js'

export function saveFileToDisk(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function videoPieceReader(
  exportVideo: (input: {id: string; offset: number}) => Promise<VideoPiece>,
): (id: string, offset: number) => Effect.Effect<VideoPiece, EvlogError> {
  return (id, offset) =>
    Effect.tryPromise({
      try: () => exportVideo({id, offset}),
      catch: (cause) => recorderErrors.EXPORT_FAILED(causeOverrides(cause)),
    })
}
