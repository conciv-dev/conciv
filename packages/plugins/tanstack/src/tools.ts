import {Tool, type BundlerDomain, type ToolDomain} from '@conciv/plugin'
import {z} from 'zod'
import {Definition} from './rpc.js'
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

export type Capabilities = ReturnType<typeof capabilities>

export function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function answer<Output>(code: string, read: () => Output | Promise<Output>) {
  try {
    return {output: await read()}
  } catch (error) {
    throw Tool.toolError({message: failureMessage(error), error, metadata: {code}})
  }
}

export function capabilities(bundler: BundlerDomain | undefined, directory: string) {
  const ring = makeDiagnosticsRing()
  const serverFnRing = makeServerFnTraceRing()
  const bundlerAvailable = typeof bundler?.subscribe === 'function'
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(diagnostic))
    serverFnRing.observe(diagnostic)
  })
  return {
    buildErrors: () => {
      if (!bundlerAvailable) throw new Error('bundler bridge unavailable')
      return ring.list()
    },
    routeManifest: () => readRouteManifest(directory),
    serverFnTrace: (count: number | undefined) => ({
      traces: serverFnRing.traces(count ?? Number.MAX_SAFE_INTEGER),
      functions: serverFnRing.functions(),
    }),
    dispose: () => unsubscribe?.(),
  }
}

export async function register(tool: ToolDomain, tanstack: Capabilities) {
  await tool.transform((editor) => {
    editor.namespace({
      name: 'tanstack',
      description: "The running TanStack app's dev server: build errors, the route manifest and server-function calls.",
    })
    editor.add({
      name: 'build_errors',
      description:
        "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
      input: Definition.methods.buildErrors.input,
      output: Definition.methods.buildErrors.output,
      options,
      execute: () => answer('BUNDLER_UNAVAILABLE', tanstack.buildErrors),
    })
    editor.add({
      name: 'route_manifest',
      description:
        "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
      input: z.object({}),
      output: z.array(RouteInfo),
      options,
      execute: () => answer('MANIFEST_UNREADABLE', tanstack.routeManifest),
    })
    editor.add({
      name: 'server_fn_trace',
      description:
        'Read recent TanStack server-function calls: which server fn ran (file + export), duration, and status. Use it to see server-side data fetching triggered by the app.',
      input: z.object({count: z.number().int().positive().max(100).optional()}),
      output: ServerFnTraces,
      options,
      execute: async ({count}) => ({output: tanstack.serverFnTrace(count)}),
    })
  })
}
