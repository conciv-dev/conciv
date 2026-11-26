import {Effect, Layer} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'
import {diagnosticsLayer} from './diagnostics.js'
import {InvalidOptions, RpcRegisterFailed} from './failures.js'
import {Definition} from './rpc.js'
import {serverFnTraceLayer} from './serverfn-trace.js'
import {capabilities, register} from './tools.js'

const Options = z.object({bundlerWaitMs: z.number().int().positive().default(10_000)})

function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function readOptions(input: unknown) {
  const parsed = Options.safeParse(input)
  if (parsed.success) return Effect.succeed(parsed.data)
  const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  return Effect.fail(InvalidOptions.make({message}))
}

export default Plugin.define({
  id: 'tanstack',
  effect: (ctx) =>
    Effect.gen(function* () {
      const options = yield* readOptions(ctx.options)
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
        .pipe(Effect.mapError((cause) => RpcRegisterFailed.make({message: failureMessage(cause)})))
      yield* register(ctx, tanstack)
    }),
})
