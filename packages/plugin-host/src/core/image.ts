export * as Image from './image.js'

import {Context, Effect, Layer, Schema} from 'effect'
import {FileSystem} from './filesystem.js'
import {State} from './state.js'

export const ResizerUnavailableError = Schema.TaggedStruct('Image.ResizerUnavailableError', {})
export type ResizerUnavailableError = typeof ResizerUnavailableError.Type & globalThis.Error

export const makeResizerUnavailableError = (): ResizerUnavailableError =>
  Object.assign(new globalThis.Error('Image resizer is unavailable'), ResizerUnavailableError.make({}), {
    name: 'Image.ResizerUnavailableError',
  })

export const DecodeError = Schema.TaggedStruct('Image.DecodeError', {
  resource: Schema.String,
})
export type DecodeError = typeof DecodeError.Type & globalThis.Error

export const makeDecodeError = (fields: Omit<typeof DecodeError.Type, '_tag'>): DecodeError =>
  Object.assign(new globalThis.Error(`Image could not be decoded: ${fields.resource}`), DecodeError.make(fields), {
    name: 'Image.DecodeError',
  })

export const SizeError = Schema.TaggedStruct('Image.SizeError', {
  resource: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  bytes: Schema.Number,
  maxWidth: Schema.Number,
  maxHeight: Schema.Number,
  maxBytes: Schema.Number,
})
export type SizeError = typeof SizeError.Type & globalThis.Error

export const makeSizeError = (fields: Omit<typeof SizeError.Type, '_tag'>): SizeError =>
  Object.assign(
    new globalThis.Error(
      `Image ${fields.resource} is ${fields.width}x${fields.height} with base64 size ${fields.bytes}, exceeding configured limits ${fields.maxWidth}x${fields.maxHeight}/${fields.maxBytes} bytes`,
    ),
    SizeError.make(fields),
    {name: 'Image.SizeError'},
  )

export type Limits = {
  autoResize: boolean
  maxWidth: number
  maxHeight: number
  maxBase64Bytes: number
}

export type Editor = {
  configure: (limits: Partial<Limits>) => void
}

export interface Interface extends State.Transformable<Editor> {
  readonly normalize: (
    resource: string,
    content: FileSystem.Content & {readonly encoding: 'base64'},
  ) => Effect.Effect<
    FileSystem.Content & {readonly encoding: 'base64'},
    ResizerUnavailableError | DecodeError | SizeError
  >
}

export const Service = Context.Service<Interface>('@opencode/Image')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = State.create<Limits, Editor>({
      name: 'image',
      initial: () => ({
        autoResize: true,
        maxWidth: 2_000,
        maxHeight: 2_000,
        maxBase64Bytes: 5 * 1024 * 1024,
      }),
      editor: (editor) => ({
        configure: (limits) => {
          if (limits.autoResize !== undefined) editor.autoResize = limits.autoResize
          if (limits.maxWidth !== undefined) editor.maxWidth = limits.maxWidth
          if (limits.maxHeight !== undefined) editor.maxHeight = limits.maxHeight
          if (limits.maxBase64Bytes !== undefined) editor.maxBase64Bytes = limits.maxBase64Bytes
        },
      }),
    })
    const loadAdapter = yield* Effect.cached(
      Effect.tryPromise({
        try: () => import('./image/photon.js'),
        catch: () => makeResizerUnavailableError(),
      }).pipe(Effect.flatMap((adapter) => adapter.make)),
    )
    const normalize = Effect.fn('Image.normalize')(function* (
      resource: string,
      content: FileSystem.Content & {readonly encoding: 'base64'},
    ) {
      const normalize = yield* loadAdapter
      return yield* normalize(resource, content, state.get())
    })
    return Service.of({transform: state.transform, reload: state.reload, normalize})
  }),
)
