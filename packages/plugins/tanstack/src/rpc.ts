import {z} from 'zod'
import {Rpc} from '@conciv/plugin/rpc'

export const FrameworkInfo = z.object({
  name: z.enum(['nextjs', 'tanstack-start', 'vue', 'solid-start', 'astro']),
  version: z.string().nullable(),
  router: z.enum(['app', 'pages', 'file-based', 'unknown']),
  dev: z.boolean(),
})
export type FrameworkInfo = z.infer<typeof FrameworkInfo>

const RouteMatch = z.object({
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

export const RouterCurrent = z.object({
  location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
  matches: z.array(RouteMatch),
})
export type RouterCurrent = z.infer<typeof RouterCurrent>

const RouteKind = z.enum(['static', 'dynamic', 'catch-all', 'layout', 'index', 'group'])

export type RouteNode = {
  id: string
  path: string
  kind: z.infer<typeof RouteKind>
  hasLoader: boolean
  children: RouteNode[]
  truncated?: number | undefined
}

export const RouteNode: z.ZodType<RouteNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    path: z.string(),
    kind: RouteKind,
    hasLoader: z.boolean(),
    children: z.array(RouteNode),
    truncated: z.number().optional(),
  }),
)

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

export const AppError = z.object({
  id: z.string(),
  kind: z.enum(['build', 'runtime', 'server', 'hydration']),
  message: z.string(),
  stack: z.string().nullable(),
  source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullable(),
  digest: z.string().nullable(),
  at: z.number(),
})
export type AppError = z.infer<typeof AppError>

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

const SessionId = z
  .string()
  .regex(/^conciv_[A-Za-z0-9_-]{1,128}$/u)
  .brand<'ConcivSessionId'>()

export const TabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)
export type TabId = z.infer<typeof TabId>
const short = z.string().max(2_048)
const tab = {
  tabId: TabId.optional().describe(
    'Tab ID returned by tanstack.tabs.list. Omit it for the tab the user focused last, which serves the call.',
  ),
}

export const Tab = z.object({
  id: TabId,
  url: z.string().max(16_384),
  title: short,
  focused: z.boolean(),
  visible: z.boolean(),
})
export type Tab = z.infer<typeof Tab>
export const State = z.object({tabs: z.array(Tab), focusedTabId: TabId.nullable()})
export type State = z.infer<typeof State>

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
) {
  return {name, description, input: z.object(fields), output, action: z.object({type: z.literal(name), ...fields})}
}

export const Operations = [
  operation(
    'tabs.list',
    "List this session's browser tabs and the tab the user focused last. A call without a tabId goes to that tab.",
    {},
    State,
  ),
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
  ),
  operation('query_refetch', 'Refetch a specific TanStack Query by its serialized key.', {...tab, ...key}, OkResult),
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
  ),
  operation('router_invalidate', 'Invalidate the TanStack Router (re-run active loaders).', tab, OkResult),
  operation('back', "Navigate the running app's TanStack Router history back one entry. Navigational.", tab, OkResult),
] as const

export type Operation = (typeof Operations)[number]
export type Method = Operation['name']
const [firstOperation, ...otherOperations] = Operations
export const Action = z.discriminatedUnion('type', [
  firstOperation.action,
  ...otherOperations.map((entry) => entry.action),
])
export type Action = z.infer<typeof Action>
export const Command = z.object({
  action: Action,
  timeoutMs: z.number().int().positive().describe("the call's own timeout"),
})
export type Command = z.infer<typeof Command>
export const Result = z.object({value: z.json()})
export type Result = z.infer<typeof Result>
export const Outcome = z.discriminatedUnion('type', [
  z.object({type: z.literal('success'), result: Result}),
  z.object({type: z.literal('failure'), code: z.string().regex(/^[a-z_]{1,64}$/u), message: short}),
])
export type Outcome = z.infer<typeof Outcome>
export const Control = z.discriminatedUnion('type', [
  z.object({type: z.literal('attached'), connectionId: z.string(), version: z.literal(1)}),
  z.object({type: z.literal('command'), connectionId: z.string(), requestId: z.string()}),
  z.object({type: z.literal('cancel'), connectionId: z.string(), requestId: z.string()}),
])
export type Control = z.infer<typeof Control>
const attachment = {sessionId: SessionId, connectionId: z.string()}
const request = {...attachment, requestId: z.string()}
const unavailable = {unavailable: z.object({})}

export const Definition = Rpc.define({
  id: 'experimental.tanstack',
  methods: {
    attach: {
      input: z.object({...attachment, version: z.literal(1)}),
      output: z.enum(['closed', 'replaced']),
      errors: {...unavailable, missing: z.object({})},
    },
    state: {input: z.object({...attachment, state: Tab}), output: z.void(), errors: unavailable},
    command: {input: z.object(request), output: Command, errors: unavailable},
    result: {input: z.object({...request, outcome: Outcome}), output: z.void(), errors: unavailable},
    'tabs.list': {input: z.object({sessionId: SessionId}), output: State},
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
  events: {control: {schema: Control}},
})
