export * as RendererCacheModel from './renderer-cache.js'
import {Context, Effect, Layer, Option, RcMap, type Scope} from 'effect'
import type {EvlogError} from 'evlog'
import type {KeyframeRenderer} from './render.js'

const RENDERER_IDLE = '5 minutes'

export type RendererCacheInterface = {
  readonly use: <Result, Failure, Requirements>(
    work: (renderer: KeyframeRenderer) => Effect.Effect<Result, Failure, Requirements>,
  ) => Effect.Effect<Option.Option<Result>, Failure, Requirements>
}

export const RendererCache = Context.Service<RendererCacheInterface>('@conciv/plugin-recorder/RendererCache')

export function rendererCacheLayer<Requirements>(
  launch: Effect.Effect<KeyframeRenderer, EvlogError, Scope.Scope | Requirements>,
) {
  return Layer.effect(
    RendererCache,
    Effect.gen(function* () {
      const renderers = yield* RcMap.make({lookup: (_key: 'chromium') => launch, idleTimeToLive: RENDERER_IDLE})
      return RendererCache.of({
        use: (work) =>
          RcMap.get(renderers, 'chromium').pipe(
            Effect.map(Option.some),
            Effect.catch((unavailable) =>
              Effect.logWarning('the keyframe renderer could not launch', unavailable).pipe(
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
