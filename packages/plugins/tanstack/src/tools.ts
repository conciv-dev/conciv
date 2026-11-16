import {z} from 'zod'
import {Effect} from 'effect'
import type {BundlerDomain} from '@conciv/plugin'
import type {Context} from '@conciv/plugin/effect/plugin'
import {Tool} from '@conciv/plugin/schema/tool'
import {Definition} from './rpc.js'
import {buildErrorToAppError, makeDiagnosticsRing} from './server/diagnostics.js'
import {readRouteManifest} from './server/route-manifest.js'
import {makeServerFnTraceRing} from './server/serverfn-trace.js'
import {info} from './skill.js'

const options = {namespace: 'tanstack', codemode: true}

type Failure = {
  readonly code: 'BUNDLER_UNAVAILABLE' | 'MANIFEST_UNREADABLE'
  readonly message: string
  readonly error: unknown
}

export type Capabilities = ReturnType<typeof makeCapabilities>

function attempt<Output>(code: Failure['code'], read: () => Output | Promise<Output>) {
  return Effect.tryPromise({
    try: async () => read(),
    catch: (error): Failure => ({code, message: error instanceof Error ? error.message : String(error), error}),
  })
}

function makeCapabilities(bundler: BundlerDomain | undefined, directory: string) {
  const ring = makeDiagnosticsRing()
  const serverFnRing = makeServerFnTraceRing()
  const bundlerAvailable = typeof bundler?.subscribe === 'function'
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(diagnostic))
    serverFnRing.observe(diagnostic)
  })
  return {
    buildErrors: () =>
      attempt('BUNDLER_UNAVAILABLE', () => {
        if (!bundlerAvailable) throw new Error('bundler bridge unavailable')
        return ring.list()
      }),
    routeManifest: () => attempt('MANIFEST_UNREADABLE', () => readRouteManifest(directory)),
    serverFnTrace: (count: number | undefined) => ({
      traces: serverFnRing.traces(count ?? Number.MAX_SAFE_INTEGER),
      functions: serverFnRing.functions(),
    }),
    dispose: () => unsubscribe?.(),
  }
}

export function capabilities(bundler: BundlerDomain | undefined, directory: string) {
  return Effect.acquireRelease(
    Effect.sync(() => makeCapabilities(bundler, directory)),
    (tanstack) => Effect.sync(tanstack.dispose),
  )
}

function toolFailure(failure: Failure) {
  return Tool.toolError({message: failure.message, error: failure.error, metadata: {code: failure.code}})
}

export const register = Effect.fn('TanstackTools.register')(function* (
  ctx: Pick<Context, 'tool' | 'skill'>,
  tanstack: Capabilities,
) {
  yield* ctx.skill.transform((editor) => editor.add(info))
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
  })
})
