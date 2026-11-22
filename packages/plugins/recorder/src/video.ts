import {Effect, FileSystem, Option, Schema} from 'effect'
import type {RrwebEvent} from './rpc.js'
import {RendererCache} from './renderer-cache.js'

const VideoUnrendered = Schema.TaggedStruct('RecorderVideoUnrendered', {cause: Schema.Defect()})
type VideoUnrendered = typeof VideoUnrendered.Type

const VideoUnreadable = Schema.TaggedStruct('RecorderVideoUnreadable', {cause: Schema.Defect()})
type VideoUnreadable = typeof VideoUnreadable.Type

const unrendered = (cause: unknown) => VideoUnrendered.make({cause})

export const renderVideoFile = Effect.fn('recorder.video.render')(function* (file: string, events: RrwebEvent[]) {
  const fs = yield* FileSystem.FileSystem
  const existing = yield* fs.stat(file).pipe(Effect.option)
  if (Option.isSome(existing) && existing.value.type === 'File') return
  const renderers = yield* RendererCache
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  const removeTemporary = fs.remove(temporary, {force: true}).pipe(Effect.ignore)
  const recorded = yield* renderers
    .use((renderer) => renderer.renderVideo(events, temporary))
    .pipe(
      Effect.mapError(unrendered),
      Effect.onError(() => removeTemporary),
    )
  if (!Option.getOrElse(recorded, () => false)) {
    yield* removeTemporary
    return yield* Effect.fail(unrendered('no video was recorded'))
  }
  yield* fs.rename(temporary, file).pipe(
    Effect.mapError(unrendered),
    Effect.onError(() => removeTemporary),
  )
})

export const readVideoPiece = Effect.fn('recorder.video.read')(
  function* (file: string, offset: number, maxBytes: number) {
    const fs = yield* FileSystem.FileSystem
    const handle = yield* fs.open(file, {flag: 'r'})
    const {size} = yield* handle.stat
    const length = Math.max(0, Math.min(maxBytes, Number(size) - offset))
    const read = length > 0 ? yield* handle.readAlloc(length, {position: BigInt(offset)}) : Option.none()
    const bytes = Option.getOrElse(read, () => new Uint8Array())
    return {data: Buffer.from(bytes).toString('base64'), eof: offset + bytes.length >= Number(size)}
  },
  Effect.scoped,
  Effect.mapError((cause) => VideoUnreadable.make({cause})),
)
