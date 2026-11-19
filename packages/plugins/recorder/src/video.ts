import {Effect, FileSystem, Option, Schema} from 'effect'
import type {RrwebEvent} from './rpc.js'
import {RendererCache} from './renderer-cache.js'

export type VideoPiece = {data: string; eof: boolean}

export const VideoUnrendered = Schema.TaggedStruct('RecorderVideoUnrendered', {cause: Schema.Defect()})
export type VideoUnrendered = typeof VideoUnrendered.Type

export const VideoUnreadable = Schema.TaggedStruct('RecorderVideoUnreadable', {cause: Schema.Defect()})
export type VideoUnreadable = typeof VideoUnreadable.Type

const unrendered = (cause: unknown) => VideoUnrendered.make({cause})

export const renderVideoFile = Effect.fn('recorder.video.render')(function* (file: string, events: RrwebEvent[]) {
  const fs = yield* FileSystem.FileSystem
  const existing = yield* fs.stat(file).pipe(Effect.option)
  if (Option.isSome(existing) && existing.value.type === 'File') return
  const renderers = yield* RendererCache
  const video = yield* renderers.use((renderer) => renderer.renderVideo(events)).pipe(Effect.mapError(unrendered))
  if (Option.isNone(video) || Option.isNone(video.value)) return yield* Effect.fail(unrendered('no video was recorded'))
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  yield* fs.writeFile(temporary, video.value.value).pipe(
    Effect.andThen(fs.rename(temporary, file)),
    Effect.mapError(unrendered),
    Effect.onError(() => fs.remove(temporary, {force: true}).pipe(Effect.ignore)),
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
