import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import * as TanstackConnection from './connection.js'
import {capabilities, register} from './tools.js'

export default Plugin.define({
  id: 'tanstack',
  effect: (ctx) =>
    Effect.gen(function* () {
      const tanstack = yield* capabilities(ctx.bundler, ctx.location.directory)
      const connection = yield* TanstackConnection.make(ctx, {
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
      yield* register(ctx, tanstack, connection)
    }),
})
