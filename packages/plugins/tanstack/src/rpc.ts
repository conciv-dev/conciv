import {z} from 'zod'
import {Rpc} from '@conciv/backend-plugin-api/rpc'

export const FrameworkInfo = z.object({
  name: z.enum(['tanstack-start']),
  version: z.string().nullable(),
  router: z.enum(['file-based']),
  dev: z.boolean(),
})
export type FrameworkInfo = z.infer<typeof FrameworkInfo>

export const RouteMatch = z.object({
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
export type RouteMatch = z.infer<typeof RouteMatch>

export const RouterCurrent = z.object({
  location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
  matches: z.array(RouteMatch),
})
export type RouterCurrent = z.infer<typeof RouterCurrent>
export type RouterLocation = RouterCurrent['location']

const RouteKind = z.enum(['static', 'dynamic', 'catch-all', 'layout', 'index'])
export type RouteNodeKind = z.infer<typeof RouteKind>

export const RouteNode = z.object({
  id: z.string(),
  path: z.string(),
  kind: RouteKind,
  hasLoader: z.boolean(),
  get children(): z.ZodArray<typeof RouteNode> {
    return z.array(RouteNode)
  },
  truncated: z.number().optional(),
})
export type RouteNode = z.infer<typeof RouteNode>

export const CacheEntry = z.object({
  key: z.string(),
  state: z.enum(['fresh', 'stale', 'fetching', 'error']),
  status: z.string().nullable(),
  value: z.unknown(),
  updatedAt: z.number().nullable(),
  error: z.string().nullable(),
  observers: z.number().nullable(),
})
export type CacheEntry = z.infer<typeof CacheEntry>
export type CacheEntryState = CacheEntry['state']

export const AppError = z.object({
  id: z.string(),
  kind: z.enum(['build', 'runtime']),
  message: z.string(),
  stack: z.string().nullable(),
  source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullable(),
  at: z.number(),
})
export type AppError = z.infer<typeof AppError>

export const RouteInfo = z.object({
  path: z.string(),
  kind: z.enum(['page', 'layout']),
  dynamic: z.boolean(),
  file: z.string().nullable(),
})
export type RouteInfo = z.infer<typeof RouteInfo>
export type RouteInfoKind = RouteInfo['kind']

export const ServerFnTraces = z.object({
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
export type ServerFnTraces = z.infer<typeof ServerFnTraces>
export type ServerFnTrace = ServerFnTraces['traces'][number]

const TabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)
export const SHORT_MAX = 2_048
const short = z.string().max(SHORT_MAX)
const tab = {
  tabId: TabId.optional().describe(
    'Tab ID returned by tanstack.tabs.list, the same IDs page.tabs.list returns. Omit it for the tab the user focused last, which serves the call.',
  ),
}

const RouteNodeTransport = z.object({
  id: z.string(),
  path: z.string(),
  kind: RouteKind,
  hasLoader: z.boolean(),
  children: z.array(z.unknown()),
  truncated: z.number().optional(),
})
const OkResult = z.object({ok: z.literal(true)})
const key = {key: z.string().describe('the serialized query key: JSON of the queryKey')}

function operation<const Name extends string, const Fields extends z.ZodRawShape, Output extends z.ZodType>(
  name: Name,
  description: string,
  fields: Fields,
  output: Output,
  mutating = false,
) {
  return {
    name,
    description,
    input: z.object(fields),
    output,
    action: z.object({type: z.literal(name), ...fields}),
    mutating,
  }
}

export const Operations = [
  operation(
    'detect',
    'Detect the TanStack app running on the page: framework name, version, and router style, read off the live React tree. Use it to confirm the page really is a TanStack app before reaching for the other tanstack tools.',
    tab,
    FrameworkInfo,
  ),
  operation(
    'router_state',
    "Read the running app's current TanStack Router state: matched routes, params, search, loader status. Use it to see what the user is looking at before acting.",
    tab,
    RouterCurrent,
  ),
  operation(
    'route_tree',
    "Read the running app's TanStack Router route tree: the nested route definitions, their paths, kinds, and which routes declare a loader. Use it to understand the app's routing structure.",
    tab,
    RouteNodeTransport,
  ),
  operation(
    'data_entries',
    'List one cache entry per matched TanStack route: its route id, freshness, and dehydrated loader data. Use it to see every piece of loader data behind the current screen at once.',
    tab,
    z.object({entries: z.array(CacheEntry)}),
  ),
  operation(
    'loader_data',
    'Read the dehydrated loader data for the current (or a named) TanStack route: the server/loader-fetched data the route is rendering. Use it to see the data behind what the user sees.',
    {...tab, routeId: z.string().optional()},
    z.object({routeId: z.string(), data: z.unknown()}),
  ),
  operation(
    'data_invalidate',
    'Invalidate the loader data of one TanStack route by its route id, so the router re-runs that loader. Nothing is deleted; the route refetches.',
    {...tab, routeId: z.string()},
    OkResult,
    true,
  ),
  operation(
    'errors_snapshot',
    'Read the runtime errors and unhandled rejections the page has buffered since it loaded. Use it when the app misbehaves in the browser rather than at build time.',
    tab,
    z.object({errors: z.array(AppError)}),
  ),
  operation(
    'query_cache',
    "Read the running app's TanStack Query cache: each query's key, status (fresh/stale/fetching/error), observer count, and dehydrated data. Use it to see what data the app has fetched and cached.",
    tab,
    z.object({queries: z.array(CacheEntry), mutations: z.array(CacheEntry)}),
  ),
  operation(
    'query_invalidate',
    'Invalidate a specific TanStack Query by its serialized key (JSON of the queryKey). Unknown keys are a no-op.',
    {...tab, ...key},
    OkResult,
    true,
  ),
  operation(
    'query_refetch',
    'Refetch a specific TanStack Query by its serialized key.',
    {...tab, ...key},
    OkResult,
    true,
  ),
  operation(
    'navigate',
    "Navigate the running app's TanStack Router to a path. This changes what the user is currently viewing but destroys nothing: no data is deleted and you can navigate back.",
    {
      ...tab,
      to: z.string(),
      params: z.record(z.string(), z.string()).optional(),
      search: z.record(z.string(), z.unknown()).optional(),
      replace: z.boolean().optional(),
    },
    z.object({ok: z.literal(true), to: z.string()}),
    true,
  ),
  operation('router_invalidate', 'Invalidate the TanStack Router (re-run active loaders).', tab, OkResult, true),
  operation(
    'back',
    "Navigate the running app's TanStack Router history back one entry. Navigational.",
    tab,
    OkResult,
    true,
  ),
] as const

export type Operation = (typeof Operations)[number]
export type Method = Operation['name']
const [firstOperation, ...otherOperations] = Operations
export const Action = z.discriminatedUnion('type', [
  firstOperation.action,
  ...otherOperations.map((entry) => entry.action),
])
export type Action = z.infer<typeof Action>
const ENGINE_CODES: readonly string[] = [
  'disconnected',
  'tab_unavailable',
  'disconnected_before_dispatch',
  'disconnected_after_dispatch',
  'dispatch_failed',
  'timeout',
]
export const Reply = z.discriminatedUnion('type', [
  z.object({type: z.literal('success'), value: z.json()}),
  z.object({
    type: z.literal('failure'),
    code: z
      .string()
      .regex(/^[a-z_]{1,64}$/u)
      .refine((code) => !ENGINE_CODES.includes(code), 'only the engine reports this code'),
    message: short,
  }),
])
export type Reply = z.infer<typeof Reply>

export const Definition = Rpc.define({
  id: 'experimental.tanstack',
  methods: {
    buildErrors: {
      input: z.undefined(),
      output: z.array(AppError),
      errors: {BUNDLER_UNAVAILABLE: z.object({})},
    },
    routeManifest: {
      input: z.undefined(),
      output: z.array(RouteInfo),
      errors: {MANIFEST_UNREADABLE: z.object({})},
    },
    serverFnTrace: {
      input: z.object({count: z.number().int().positive().max(100).optional()}),
      output: ServerFnTraces,
    },
  },
  events: {},
})
