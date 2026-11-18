import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import {Definition} from './rpc.js'
import {capabilities, register} from './tools.js'

export default Plugin.define({
  id: 'tanstack',
  effect: (ctx) =>
    Effect.gen(function* () {
      const tanstack = yield* capabilities(ctx)
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
          serverFnTrace: ({count}) => Effect.succeed(tanstack.serverFnTrace(count)),
        })
        .pipe(Effect.orDie)
      yield* register(ctx, tanstack)
    }),
})
