export * as RendererCacheModel from './renderer-cache.js'
import {Context, Effect, Layer, Option, RcMap, type Scope} from 'effect'
import type {KeyframeRenderer, RendererUnavailable} from './render.js'

const RENDERER_IDLE = '5 minutes'

export type RendererCacheInterface = {
  readonly use: <Result, Failure, Requirements>(
    work: (renderer: KeyframeRenderer) => Effect.Effect<Result, Failure, Requirements>,
  ) => Effect.Effect<Option.Option<Result>, Failure, Requirements>
}

export const RendererCache = Context.Service<RendererCacheInterface>('@conciv/plugin-recorder/RendererCache')

export function rendererCacheLayer<Requirements>(
  launch: Effect.Effect<KeyframeRenderer, RendererUnavailable, Scope.Scope | Requirements>,
) {
  return Layer.effect(
    RendererCache,
    Effect.gen(function* () {
      const renderers = yield* RcMap.make({lookup: (_key: 'chromium') => launch, idleTimeToLive: RENDERER_IDLE})
      return RendererCache.of({
        use: (work) =>
          RcMap.get(renderers, 'chromium').pipe(
            Effect.map(Option.some),
            Effect.catchTag('RecorderRendererUnavailable', (unavailable) =>
              Effect.logWarning('the keyframe renderer could not launch', unavailable.cause).pipe(
                Effect.andThen(RcMap.invalidate(renderers, 'chromium')),
                Effect.as(Option.none()),
              ),
            ),
            Effect.flatMap((renderer) =>
              Option.isSome(renderer) ? Effect.map(work(renderer.value), Option.some) : Effect.succeed(Option.none()),
            ),
            Effect.scoped,
          ),
      })
    }),
  )
}
