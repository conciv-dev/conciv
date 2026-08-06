import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

const OkOutput = z.object({ok: z.literal(true)})

const RouterLocationOutput = z.object({pathname: z.string(), search: z.string(), hash: z.string()}).loose()

const RouteMatchOutput = z
  .object({routeId: z.string(), path: z.string(), status: z.string(), loaderData: z.unknown()})
  .loose()

const CacheEntryOutput = z.object({key: z.string(), state: z.string(), value: z.unknown()}).loose()

const SourceLocOutput = z.object({file: z.string(), line: z.number(), column: z.number()}).loose()

const AppErrorOutput = z.object({kind: z.string(), message: z.string(), source: SourceLocOutput.nullable()}).loose()

export const routerStateDef = toolDefinition({
  name: 'tanstack_router_state',
  description:
    "Read the running app's current TanStack Router state: matched routes, params, search, loader status. Use it to see what the user is looking at before acting.",
  inputSchema: z.object({}),
  outputSchema: z.object({location: RouterLocationOutput, matches: z.array(RouteMatchOutput)}).loose(),
  meta: {
    summary: 'read the current router state of the running app',
    category: 'tanstack',
    mutating: false,
    keywords: ['router', 'matches', 'search'],
    hint: 'shows what the user is looking at right now',
  },
})

export const routeTreeDef = toolDefinition({
  name: 'tanstack_route_tree',
  description:
    "Read the running app's TanStack Router route tree: the nested route definitions, their paths, kinds, and which routes declare a loader. Use it to understand the app's routing structure.",
  inputSchema: z.object({}),
  outputSchema: z
    .object({
      id: z.string(),
      path: z.string(),
      kind: z.string(),
      hasLoader: z.boolean(),
      children: z.array(z.unknown()),
    })
    .loose(),
  meta: {
    summary: 'read the nested route tree the running router declares',
    category: 'tanstack',
    mutating: false,
    keywords: ['router', 'routes', 'tree'],
  },
})

export const loaderDataDef = toolDefinition({
  name: 'tanstack_loader_data',
  description:
    'Read the dehydrated loader data for the current (or a named) TanStack route - the server/loader-fetched data the route is rendering. Use it to see the data behind what the user sees.',
  inputSchema: z.object({routeId: z.string().optional()}),
  outputSchema: z.unknown(),
  meta: {
    summary: 'read the dehydrated loader data behind a route',
    category: 'tanstack',
    mutating: false,
    keywords: ['loader', 'data'],
    hint: 'defaults to the deepest matched route when routeId is omitted',
  },
})

export const queryCacheDef = toolDefinition({
  name: 'tanstack_query_cache',
  description:
    "Read the running app's TanStack Query cache: each query's key, status (fresh/stale/fetching/error), observer count, and dehydrated data. Use it to see what data the app has fetched and cached.",
  inputSchema: z.object({}),
  outputSchema: z.object({queries: z.array(CacheEntryOutput), mutations: z.array(CacheEntryOutput)}),
  meta: {
    summary: 'read the query cache of the running app',
    category: 'tanstack',
    mutating: false,
    keywords: ['query', 'cache'],
  },
})

export const navigateDef = toolDefinition({
  name: 'tanstack_navigate',
  description:
    "Navigate the running app's TanStack Router to a path. This changes what the user is currently viewing but destroys nothing - no data is deleted and you can navigate back.",
  inputSchema: z.object({to: z.string(), replace: z.boolean().optional()}),
  outputSchema: z.object({ok: z.literal(true), to: z.string()}),
  meta: {
    summary: 'navigate the running app to a path',
    category: 'tanstack',
    mutating: true,
    keywords: ['router', 'navigate'],
    hint: 'changes what the user sees; reversible with tanstack_back',
  },
})

export const routerInvalidateDef = toolDefinition({
  name: 'tanstack_invalidate',
  description: 'Invalidate the TanStack Router (re-run active loaders).',
  inputSchema: z.object({}),
  outputSchema: OkOutput,
  meta: {
    summary: 're-run the active route loaders',
    category: 'tanstack',
    mutating: true,
    keywords: ['router', 'invalidate', 'reload'],
  },
})

export const backDef = toolDefinition({
  name: 'tanstack_back',
  description: "Navigate the running app's TanStack Router history back one entry. Navigational.",
  inputSchema: z.object({}),
  outputSchema: OkOutput,
  meta: {
    summary: 'go back one entry in the router history',
    category: 'tanstack',
    mutating: true,
    keywords: ['router', 'back', 'history'],
  },
})

export const queryInvalidateDef = toolDefinition({
  name: 'tanstack_query_invalidate',
  description:
    'Invalidate a specific TanStack Query by its serialized key (JSON of the queryKey). Unknown keys are a no-op.',
  inputSchema: z.object({key: z.string()}),
  outputSchema: OkOutput,
  meta: {
    summary: 'invalidate one query by its serialized key',
    category: 'tanstack',
    mutating: true,
    keywords: ['query', 'invalidate'],
    hint: 'unknown keys are a no-op',
  },
})

export const queryRefetchDef = toolDefinition({
  name: 'tanstack_query_refetch',
  description: 'Refetch a specific TanStack Query by its serialized key.',
  inputSchema: z.object({key: z.string()}),
  outputSchema: OkOutput,
  meta: {
    summary: 'refetch one query by its serialized key',
    category: 'tanstack',
    mutating: true,
    keywords: ['query', 'refetch'],
  },
})

export const buildErrorsDef = toolDefinition({
  name: 'tanstack_build_errors',
  description:
    "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
  inputSchema: z.object({}),
  outputSchema: z.array(AppErrorOutput),
  errors: {BUNDLER_UNAVAILABLE: {message: 'bundler bridge unavailable'}},
  meta: {
    summary: 'read recent build and transform errors from the dev server',
    category: 'tanstack',
    mutating: false,
    keywords: ['build', 'errors', 'compile'],
    hint: 'use when the app is broken or a change did not take effect',
  },
})

export const routeManifestDef = toolDefinition({
  name: 'tanstack_route_manifest',
  description:
    "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({path: z.string(), kind: z.string(), dynamic: z.boolean(), file: z.string().nullable()}).loose(),
  ),
  errors: {MANIFEST_UNREADABLE: {message: 'the generated route tree could not be read'}},
  meta: {
    summary: 'read every defined route from the generated route tree',
    category: 'tanstack',
    mutating: false,
    keywords: ['routes', 'manifest'],
  },
})

export const serverFnTraceDef = toolDefinition({
  name: 'tanstack_server_fn_trace',
  description:
    'Read recent TanStack server-function calls: which server fn ran (file + export), duration, and status. Use it to see server-side data fetching triggered by the app.',
  inputSchema: z.object({count: z.number().int().positive().max(100).optional()}),
  outputSchema: z.object({
    traces: z.array(z.object({name: z.string(), durationMs: z.number(), status: z.string()}).loose()),
    functions: z.array(z.object({name: z.string()}).loose()),
  }),
  meta: {
    summary: 'read recent server-function calls and their timings',
    category: 'tanstack',
    mutating: false,
    keywords: ['server', 'functions', 'trace'],
  },
})
