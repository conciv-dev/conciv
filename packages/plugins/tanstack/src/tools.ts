import {z} from 'zod'
import {Deferred, Effect, Stream} from 'effect'
import type {Context} from '@conciv/plugin/effect/plugin'
import {Tool} from '@conciv/plugin/schema/tool'
import type {Connection} from './connection.js'
import {UNTRUSTED_NOTE} from './failures.js'
import {Action, Definition, Operations, type AppError, type Operation} from './rpc.js'
import {buildErrorToAppError, makeDiagnosticsRing} from './server/diagnostics.js'
import {readRouteManifest} from './server/route-manifest.js'
import {makeServerFnTraceRing} from './server/serverfn-trace.js'
import {info, pageInfo} from './skill.js'

const options = {namespace: 'tanstack', codemode: true}

const JsonObject = z.record(z.string(), z.json())

const UNTRUSTED = {type: 'text' as const, text: UNTRUSTED_NOTE}

type Failure = {
  readonly code: 'BUNDLER_UNAVAILABLE' | 'MANIFEST_UNREADABLE'
  readonly message: string
  readonly error: unknown
}

export type Capabilities = Effect.Success<ReturnType<typeof capabilities>>

function toFailure(code: Failure['code']) {
  return (error: unknown): Failure => ({code, message: error instanceof Error ? error.message : String(error), error})
}

export const capabilities = Effect.fn('TanstackTools.capabilities')(function* (
  ctx: Pick<Context, 'event' | 'location'>,
) {
  const ring = makeDiagnosticsRing()
  const serverFnRing = makeServerFnTraceRing()
  const attached = yield* Deferred.make<boolean>()
  yield* ctx.event.subscribe({types: ['bundler.status', 'bundler.diagnostic']}).pipe(
    Stream.runForEach((event) => {
      if (event.type === 'bundler.status') return Deferred.succeed(attached, event.data.status === 'connected')
      return Effect.sync(() => {
        if (event.data.diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(event.data.diagnostic))
        serverFnRing.observe(event.data.diagnostic)
      })
    }),
    Effect.forkScoped({startImmediately: true}),
  )
  return {
    buildErrors: (): Effect.Effect<AppError[], Failure> =>
      Deferred.await(attached).pipe(
        Effect.flatMap((available) =>
          available
            ? Effect.sync(() => ring.list())
            : Effect.fail(toFailure('BUNDLER_UNAVAILABLE')(new Error('bundler bridge unavailable'))),
        ),
      ),
    routeManifest: () =>
      readRouteManifest(ctx.location.directory).pipe(Effect.mapError(toFailure('MANIFEST_UNREADABLE'))),
    serverFnTrace: (count: number | undefined) => ({
      traces: serverFnRing.traces(count ?? Number.MAX_SAFE_INTEGER),
      functions: serverFnRing.functions(),
    }),
  }
})

function toolFailure(failure: Failure) {
  return Tool.toolError({message: failure.message, error: failure.error, metadata: {code: failure.code}})
}

export const register = Effect.fn('TanstackTools.register')(function* (
  ctx: Pick<Context, 'tool' | 'skill'>,
  tanstack: Capabilities,
  connection: Connection,
) {
  const execute = Effect.fn('TanstackTools.execute')(function* (
    operation: Operation,
    input: unknown,
    tool: Tool.Context,
  ) {
    const action = yield* Effect.try({
      try: () => Action.parse({...JsonObject.parse(input), type: operation.name}),
      catch: (error) => Tool.toolError({message: `Invalid input for tanstack.${operation.name}.`, error}),
    })
    if (action.type === 'tabs.list') return {output: connection.tabs(tool.sessionId), content: [UNTRUSTED]}
    const result = yield* connection.request(tool.sessionId, action)
    const output = operation.output.safeParse(result.value)
    if (!output.success)
      return yield* Effect.fail(
        Tool.toolError({
          message: `The page returned an invalid result for tanstack.${operation.name}. Check that the engine and the page run compatible versions. Do not retry the same action to repair a protocol error; it may already have run.`,
          error: output.error,
        }),
      )
    return {output: output.data, content: [UNTRUSTED]}
  })

  yield* ctx.skill.transform((editor) => {
    editor.add(info)
    editor.add(pageInfo)
  })
  yield* ctx.tool.transform((editor) => {
    editor.namespace({
      name: 'tanstack',
      description: "The running TanStack app's dev server: build errors, the route manifest and server-function calls.",
    })
    editor.add({
      name: 'build_errors',
      description:
        "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
      input: z.object({}),
      output: Definition.methods.buildErrors.output,
      options,
      execute: () =>
        tanstack.buildErrors().pipe(
          Effect.map((output) => ({output})),
          Effect.mapError(toolFailure),
        ),
    })
    editor.add({
      name: 'route_manifest',
      description:
        "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
      input: z.object({}),
      output: Definition.methods.routeManifest.output,
      options,
      execute: () =>
        tanstack.routeManifest().pipe(
          Effect.map((output) => ({output})),
          Effect.mapError(toolFailure),
        ),
    })
    editor.add({
      name: 'server_fn_trace',
      description:
        'Read recent TanStack server-function calls: which server fn ran (file + export), duration, and status. Use it to see server-side data fetching triggered by the app.',
      input: Definition.methods.serverFnTrace.input,
      output: Definition.methods.serverFnTrace.output,
      options,
      execute: ({count}) => Effect.succeed({output: tanstack.serverFnTrace(count)}),
    })
    Operations.forEach((operation) => {
      const separator = operation.name.lastIndexOf('.')
      editor.add({
        name: operation.name.slice(separator + 1),
        description: operation.description,
        input: operation.input,
        output: operation.output,
        options: {
          namespace: separator < 0 ? 'tanstack' : `tanstack.${operation.name.slice(0, separator)}`,
          permission: 'tanstack',
          codemode: true,
        },
        execute: (input, tool) => execute(operation, input, tool),
      })
    })
  })
})
