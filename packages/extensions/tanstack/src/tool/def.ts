import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'
import type {
  AppError,
  CacheEntry,
  FrameworkInfo,
  RouteMatch,
  RouteNode,
  RouterCurrent,
} from '@conciv/protocol/framework-types'

const FrameworkInfoSchema: z.ZodType<FrameworkInfo> = z.object({
  name: z.enum(['nextjs', 'tanstack-start', 'vue', 'solid-start', 'astro']),
  version: z.string().nullable(),
  router: z.enum(['app', 'pages', 'file-based', 'unknown']),
  dev: z.boolean(),
})

const RouteMatchSchema: z.ZodType<RouteMatch> = z.object({
  id: z.string(),
  routeId: z.string(),
  path: z.string(),
  params: z.record(z.string(), z.string()),
  search: z.record(z.string(), z.unknown()),
  status: z.enum(['pending', 'success', 'error', 'notFound', 'redirected']),
  error: z.string().nullable(),
  loaderData: z.unknown(),
  updatedAt: z.number().nullable(),
  isFetching: z.boolean(),
})

const RouterCurrentSchema: z.ZodType<RouterCurrent> = z.object({
  location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
  matches: z.array(RouteMatchSchema),
})

const RouteKindSchema = z.enum(['static', 'dynamic', 'catch-all', 'layout', 'index', 'group'])

export const RouteNodeSchema: z.ZodType<RouteNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    path: z.string(),
    kind: RouteKindSchema,
    hasLoader: z.boolean(),
    children: z.array(RouteNodeSchema),
    truncated: z.number().optional(),
  }),
)

const RouteNodeTransportSchema = z.object({
  id: z.string(),
  path: z.string(),
  kind: RouteKindSchema,
  hasLoader: z.boolean(),
  children: z.array(z.unknown()),
  truncated: z.number().optional(),
})

const CacheEntrySchema: z.ZodType<CacheEntry> = z.object({
  key: z.string(),
  state: z.enum(['fresh', 'stale', 'fetching', 'error']),
  status: z.string().nullable(),
  value: z.unknown(),
  updatedAt: z.number().nullable(),
  error: z.string().nullable(),
  observers: z.number().nullable(),
})

const AppErrorSchema: z.ZodType<AppError> = z.object({
  id: z.string(),
  kind: z.enum(['build', 'runtime', 'server', 'hydration']),
  message: z.string(),
  stack: z.string().nullable(),
  source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullable(),
  digest: z.string().nullable(),
  at: z.number(),
})

const OkOutput = z.object({ok: z.literal(true)})

const NoInput = z.object({})

const KeyInput = z.object({key: z.string()})

const RouteIdInput = z.object({routeId: z.string()})

const SourceLocOutput = z.object({file: z.string(), line: z.number(), column: z.number()}).loose()

const AppErrorOutput = z.object({kind: z.string(), message: z.string(), source: SourceLocOutput.nullable()}).loose()

export const detectDef = toolDefinition({
  name: 'tanstack_detect',
  description:
    'Detect the TanStack app running on the page: framework name, version, and router style, read off the live React tree. Use it to confirm the page really is a TanStack app before reaching for the other tanstack tools.',
  inputSchema: NoInput,
  outputSchema: FrameworkInfoSchema,
  meta: {
    summary: 'detect the TanStack app running on the page',
    category: 'tanstack',
    mutating: false,
    keywords: ['framework', 'detect', 'router'],
    icon: 'read',
    label: {running: 'Detecting the framework', done: 'Detected the framework'},
  },
})

export const routerStateDef = toolDefinition({
  name: 'tanstack_router_state',
  description:
    "Read the running app's current TanStack Router state: matched routes, params, search, loader status. Use it to see what the user is looking at before acting.",
  inputSchema: NoInput,
  outputSchema: RouterCurrentSchema,
  meta: {
    summary: 'read the current router state of the running app',
    category: 'tanstack',
    mutating: false,
    keywords: ['router', 'matches', 'search'],
    hint: 'shows what the user is looking at right now',
    icon: 'read',
    label: {running: 'Reading the router state', done: 'Read the router state'},
  },
})

export const routeTreeDef = toolDefinition({
  name: 'tanstack_route_tree',
  description:
    "Read the running app's TanStack Router route tree: the nested route definitions, their paths, kinds, and which routes declare a loader. Use it to understand the app's routing structure.",
  inputSchema: NoInput,
  outputSchema: RouteNodeTransportSchema,
  meta: {
    summary: 'read the nested route tree the running router declares',
    category: 'tanstack',
    mutating: false,
    keywords: ['router', 'routes', 'tree'],
    icon: 'read',
    label: {running: 'Reading the route tree', done: 'Read the route tree'},
  },
})

export const dataEntriesDef = toolDefinition({
  name: 'tanstack_data_entries',
  description:
    'List one cache entry per matched TanStack route: its route id, freshness, and dehydrated loader data. Use it to see every piece of loader data behind the current screen at once.',
  inputSchema: NoInput,
  outputSchema: z.object({entries: z.array(CacheEntrySchema)}),
  meta: {
    summary: 'list the loader-data entries of the matched routes',
    category: 'tanstack',
    mutating: false,
    keywords: ['loader', 'data', 'entries'],
    icon: 'read',
    label: {running: 'Reading the loader entries', done: 'Read the loader entries'},
  },
})

export const loaderDataDef = toolDefinition({
  name: 'tanstack_loader_data',
  description:
    'Read the dehydrated loader data for the current (or a named) TanStack route - the server/loader-fetched data the route is rendering. Use it to see the data behind what the user sees.',
  inputSchema: z.object({routeId: z.string().optional()}),
  outputSchema: z.object({routeId: z.string(), data: z.unknown()}),
  meta: {
    summary: 'read the dehydrated loader data behind a route',
    category: 'tanstack',
    mutating: false,
    keywords: ['loader', 'data'],
    hint: 'defaults to the deepest matched route when routeId is omitted',
    icon: 'read',
    label: {running: 'Reading the loader data', done: 'Read the loader data'},
  },
})

export const dataInvalidateDef = toolDefinition({
  name: 'tanstack_data_invalidate',
  description:
    'Invalidate the loader data of one TanStack route by its route id, so the router re-runs that loader. Nothing is deleted; the route refetches.',
  inputSchema: RouteIdInput,
  outputSchema: OkOutput,
  meta: {
    summary: 'invalidate the loader data of one route',
    category: 'tanstack',
    mutating: true,
    keywords: ['loader', 'invalidate'],
    icon: 'edit',
    label: {running: 'Invalidating the loader data', done: 'Invalidated the loader data'},
  },
})

export const errorsSnapshotDef = toolDefinition({
  name: 'tanstack_errors_snapshot',
  description:
    'Read the runtime errors and unhandled rejections the page has buffered since it loaded. Use it when the app misbehaves in the browser rather than at build time.',
  inputSchema: NoInput,
  outputSchema: z.object({errors: z.array(AppErrorSchema)}),
  meta: {
    summary: 'read the buffered runtime errors of the page',
    category: 'tanstack',
    mutating: false,
    keywords: ['runtime', 'errors', 'exceptions'],
    hint: 'browser-side errors; build failures live in tanstack_build_errors',
    icon: 'read',
    label: {running: 'Reading runtime errors', done: 'Read runtime errors'},
  },
})

export const queryCacheDef = toolDefinition({
  name: 'tanstack_query_cache',
  description:
    "Read the running app's TanStack Query cache: each query's key, status (fresh/stale/fetching/error), observer count, and dehydrated data. Use it to see what data the app has fetched and cached.",
  inputSchema: NoInput,
  outputSchema: z.object({queries: z.array(CacheEntrySchema), mutations: z.array(CacheEntrySchema)}),
  meta: {
    summary: 'read the query cache of the running app',
    category: 'tanstack',
    mutating: false,
    keywords: ['query', 'cache'],
    icon: 'read',
    label: {running: 'Reading the query cache', done: 'Read the query cache'},
  },
})

export const queryInvalidateDef = toolDefinition({
  name: 'tanstack_query_invalidate',
  description:
    'Invalidate a specific TanStack Query by its serialized key (JSON of the queryKey). Unknown keys are a no-op.',
  inputSchema: KeyInput,
  outputSchema: OkOutput,
  meta: {
    summary: 'invalidate one query by its serialized key',
    category: 'tanstack',
    mutating: true,
    keywords: ['query', 'invalidate'],
    hint: 'unknown keys are a no-op',
    icon: 'edit',
    label: {running: 'Invalidating a query', done: 'Invalidated a query'},
  },
})

export const queryRefetchDef = toolDefinition({
  name: 'tanstack_query_refetch',
  description: 'Refetch a specific TanStack Query by its serialized key.',
  inputSchema: KeyInput,
  outputSchema: OkOutput,
  meta: {
    summary: 'refetch one query by its serialized key',
    category: 'tanstack',
    mutating: true,
    keywords: ['query', 'refetch'],
    icon: 'edit',
    label: {running: 'Refetching a query', done: 'Refetched a query'},
  },
})

export const navigateDef = toolDefinition({
  name: 'tanstack_navigate',
  description:
    "Navigate the running app's TanStack Router to a path. This changes what the user is currently viewing but destroys nothing - no data is deleted and you can navigate back.",
  inputSchema: z.object({
    to: z.string(),
    params: z.record(z.string(), z.string()).optional(),
    search: z.record(z.string(), z.unknown()).optional(),
    replace: z.boolean().optional(),
  }),
  outputSchema: z.object({ok: z.literal(true), to: z.string()}),
  meta: {
    summary: 'navigate the running app to a path',
    category: 'tanstack',
    mutating: true,
    keywords: ['router', 'navigate'],
    hint: 'changes what the user sees; reversible with tanstack_back',
    icon: 'pointer',
    label: {running: 'Navigating', done: 'Navigated'},
  },
})

export const routerInvalidateDef = toolDefinition({
  name: 'tanstack_router_invalidate',
  description: 'Invalidate the TanStack Router (re-run active loaders).',
  inputSchema: NoInput,
  outputSchema: OkOutput,
  meta: {
    summary: 're-run the active route loaders',
    category: 'tanstack',
    mutating: true,
    keywords: ['router', 'invalidate', 'reload'],
    icon: 'edit',
    label: {running: 'Invalidating the router', done: 'Invalidated the router'},
  },
})

export const backDef = toolDefinition({
  name: 'tanstack_back',
  description: "Navigate the running app's TanStack Router history back one entry. Navigational.",
  inputSchema: NoInput,
  outputSchema: OkOutput,
  meta: {
    summary: 'go back one entry in the router history',
    category: 'tanstack',
    mutating: true,
    keywords: ['router', 'back', 'history'],
    icon: 'pointer',
    label: {running: 'Going back', done: 'Went back'},
  },
})

export const buildErrorsDef = toolDefinition({
  name: 'tanstack_build_errors',
  description:
    "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
  inputSchema: NoInput,
  outputSchema: z.array(AppErrorOutput),
  errors: {BUNDLER_UNAVAILABLE: {message: 'bundler bridge unavailable'}},
  meta: {
    summary: 'read recent build and transform errors from the dev server',
    category: 'tanstack',
    mutating: false,
    keywords: ['build', 'errors', 'compile'],
    hint: 'use when the app is broken or a change did not take effect',
    icon: 'read',
    label: {running: 'Reading build errors', done: 'Read build errors'},
  },
})

export const routeManifestDef = toolDefinition({
  name: 'tanstack_route_manifest',
  description:
    "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
  inputSchema: NoInput,
  outputSchema: z.array(
    z.object({path: z.string(), kind: z.string(), dynamic: z.boolean(), file: z.string().nullable()}).loose(),
  ),
  errors: {MANIFEST_UNREADABLE: {message: 'the generated route tree could not be read'}},
  meta: {
    summary: 'read every defined route from the generated route tree',
    category: 'tanstack',
    mutating: false,
    keywords: ['routes', 'manifest'],
    icon: 'read',
    label: {running: 'Reading the route manifest', done: 'Read the route manifest'},
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
    icon: 'read',
    label: {running: 'Reading server-fn traces', done: 'Read server-fn traces'},
  },
})

export const TANSTACK_PAGE_TOOL_DEFS = [
  detectDef,
  routerStateDef,
  routeTreeDef,
  dataEntriesDef,
  loaderDataDef,
  dataInvalidateDef,
  errorsSnapshotDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  navigateDef,
  routerInvalidateDef,
  backDef,
] as const
