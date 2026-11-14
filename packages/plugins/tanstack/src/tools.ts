import {Tool, type BundlerDomain, type ToolDomain} from '@conciv/plugin'
import {z} from 'zod'
import {AppError} from './rpc.js'
import {buildErrorToAppError, makeDiagnosticsRing} from './server/diagnostics.js'
import {readRouteManifest} from './server/route-manifest.js'
import {makeServerFnTraceRing} from './server/serverfn-trace.js'

const options = {namespace: 'tanstack', codemode: true}

const RouteInfo = z.object({
  path: z.string(),
  kind: z.enum(['page', 'layout', 'api', 'middleware']),
  dynamic: z.boolean(),
  file: z.string().nullable(),
})

const ServerFnTraces = z.object({
  traces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      durationMs: z.number(),
      status: z.enum(['ok', 'error']),
      at: z.number(),
    }),
  ),
  functions: z.array(
    z.object({id: z.string(), name: z.string(), route: z.string().nullable(), file: z.string().nullable()}),
  ),
})

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function register(tool: ToolDomain, bundler: BundlerDomain | undefined, directory: string) {
  const ring = makeDiagnosticsRing()
  const serverFnRing = makeServerFnTraceRing()
  const bundlerAvailable = typeof bundler?.subscribe === 'function'
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(diagnostic))
    serverFnRing.observe(diagnostic)
  })
  await tool.transform((editor) => {
    editor.namespace({
      name: 'tanstack',
      description: "The running TanStack app's dev server: build errors, the route manifest and server-function calls.",
    })
    editor.add({
      name: 'build_errors',
      description:
        "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
      input: z.object({}),
      output: z.array(AppError),
      options,
      execute: async () => {
        if (!bundlerAvailable)
          throw Tool.toolError({message: 'bundler bridge unavailable', metadata: {code: 'BUNDLER_UNAVAILABLE'}})
        return {output: ring.list()}
      },
    })
    editor.add({
      name: 'route_manifest',
      description:
        "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
      input: z.object({}),
      output: z.array(RouteInfo),
      options,
      execute: async () => {
        try {
          return {output: await readRouteManifest(directory)}
        } catch (error) {
          throw Tool.toolError({message: failureMessage(error), error, metadata: {code: 'MANIFEST_UNREADABLE'}})
        }
      },
    })
    editor.add({
      name: 'server_fn_trace',
      description:
        'Read recent TanStack server-function calls: which server fn ran (file + export), duration, and status. Use it to see server-side data fetching triggered by the app.',
      input: z.object({count: z.number().int().positive().max(100).optional()}),
      output: ServerFnTraces,
      options,
      execute: async ({count}) => ({
        output: {traces: serverFnRing.traces(count ?? Number.MAX_SAFE_INTEGER), functions: serverFnRing.functions()},
      }),
    })
  })
  return () => unsubscribe?.()
}
