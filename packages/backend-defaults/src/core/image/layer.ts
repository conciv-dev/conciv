import {Effect, Layer} from 'effect'
import {Image, State} from '@conciv/backend-app-api'
import {imageErrors} from '@conciv/errors'

export const layer = Layer.effect(
  Image.Service,
  Effect.gen(function* () {
    const state = State.create<Image.Limits, Image.Editor>({
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
        try: () => import('./photon.js'),
        catch: (cause) => imageErrors.RESIZER_UNAVAILABLE({cause: cause instanceof Error ? cause : undefined}),
      }).pipe(Effect.flatMap((adapter) => adapter.make)),
    )
    const normalize = Effect.fn('Image.normalize')(function* (
      resource: string,
      content: Image.Content & {readonly encoding: 'base64'},
    ) {
      const normalize = yield* loadAdapter
      return yield* normalize(resource, content, state.get())
    })
    return Image.Service.of({transform: state.transform, reload: state.reload, normalize})
  }),
)
