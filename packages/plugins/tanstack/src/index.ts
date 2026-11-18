import {Effect, Layer} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'
import {diagnosticsLayer} from './diagnostics.js'
import {Definition} from './rpc.js'
import {serverFnTraceLayer} from './serverfn-trace.js'
import {capabilities, register} from './tools.js'

const Options = z.object({bundlerWaitMs: z.number().int().positive().default(10_000)})

export default Plugin.define({
  id: 'tanstack',
  effect: (ctx) =>
    Effect.gen(function* () {
      const options = yield* Effect.try({try: () => Options.parse(ctx.options), catch: (error) => error}).pipe(
        Effect.orDie,
      )
      const rings = yield* Layer.build(Layer.mergeAll(diagnosticsLayer, serverFnTraceLayer))
      const tanstack = yield* capabilities(ctx, ctx.location.directory, options).pipe(Effect.provide(rings))
      yield* ctx.rpc
        .register(Definition, {
          buildErrors: (_input, call) =>
            tanstack
              .buildErrors()
              .pipe(Effect.mapError((failure) => call.error('BUNDLER_UNAVAILABLE', failure.message, {}))),
          routeManifest: (_input, call) =>
            tanstack
              .routeManifest()
              .pipe(Effect.mapError((failure) => call.error('MANIFEST_UNREADABLE', failure.message, {}))),
          serverFnTrace: ({count}) => tanstack.serverFnTrace(count),
        })
        .pipe(Effect.orDie)
      yield* register(ctx, tanstack)
    }),
})
