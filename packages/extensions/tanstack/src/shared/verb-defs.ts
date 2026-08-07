import {z} from 'zod'
import {defineTool} from '@conciv/extension/tool'
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

const RouteNodeSchema: z.ZodType<RouteNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    path: z.string(),
    kind: z.enum(['static', 'dynamic', 'catch-all', 'layout', 'index', 'group']),
    hasLoader: z.boolean(),
    children: z.array(RouteNodeSchema),
    truncated: z.number().optional(),
  }),
)

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

const OkSchema = z.object({ok: z.literal(true)})

const noInput = z.object({})

const RouteIdInput = z.object({routeId: z.string()})

const KeyInput = z.object({key: z.string()})

function verbTool<Shape extends z.ZodRawShape, Out extends z.ZodType>(spec: {
  verb: string
  summary: string
  mutating?: boolean
  input: z.ZodObject<Shape>
  result: Out
}) {
  return defineTool({
    name: `tanstack.${spec.verb}`,
    description: spec.summary,
    inputSchema: spec.input,
    outputSchema: z.object({result: spec.result}),
    meta: {summary: spec.summary, category: 'tanstack', mutating: spec.mutating ?? false},
  })
}

export const detectDef = verbTool({
  verb: 'detect',
  summary: 'detect the running TanStack app from its live React tree',
  input: noInput,
  result: FrameworkInfoSchema,
})

export const routerStateDef = verbTool({
  verb: 'routerState',
  summary: 'read the live router location and matches off the page',
  input: noInput,
  result: RouterCurrentSchema,
})

export const routeTreeDef = verbTool({
  verb: 'routeTree',
  summary: 'read the live route tree off the page',
  input: noInput,
  result: RouteNodeSchema,
})

export const dataEntriesDef = verbTool({
  verb: 'dataEntries',
  summary: 'list the loader-data entries of the matched routes',
  input: noInput,
  result: z.array(CacheEntrySchema),
})

export const dataGetDef = verbTool({
  verb: 'dataGet',
  summary: 'read the dehydrated loader data of one route',
  input: RouteIdInput,
  result: z.unknown(),
})

export const dataInvalidateDef = verbTool({
  verb: 'dataInvalidate',
  summary: 'invalidate the loader data of one route',
  mutating: true,
  input: RouteIdInput,
  result: OkSchema,
})

export const dataRefetchDef = verbTool({
  verb: 'dataRefetch',
  summary: 'refetch the loader data of one route',
  mutating: true,
  input: RouteIdInput,
  result: OkSchema,
})

export const errorsSnapshotDef = verbTool({
  verb: 'errorsSnapshot',
  summary: 'read the buffered runtime errors off the page',
  input: noInput,
  result: z.array(AppErrorSchema),
})

export const queryCacheDef = verbTool({
  verb: 'queryCache',
  summary: 'read the live query and mutation cache off the page',
  input: noInput,
  result: z.object({queries: z.array(CacheEntrySchema), mutations: z.array(CacheEntrySchema)}),
})

export const queryInvalidateDef = verbTool({
  verb: 'queryInvalidate',
  summary: 'invalidate one query by its serialized key in the live page',
  mutating: true,
  input: KeyInput,
  result: OkSchema,
})

export const queryRefetchDef = verbTool({
  verb: 'queryRefetch',
  summary: 'refetch one query by its serialized key in the live page',
  mutating: true,
  input: KeyInput,
  result: OkSchema,
})

export const navigateDef = verbTool({
  verb: 'navigate',
  summary: 'navigate the live router to a path',
  mutating: true,
  input: z.object({
    to: z.string(),
    params: z.record(z.string(), z.string()).optional(),
    search: z.record(z.string(), z.unknown()).optional(),
    replace: z.boolean().optional(),
  }),
  result: OkSchema,
})

export const routerInvalidateDef = verbTool({
  verb: 'routerInvalidate',
  summary: 're-run the active loaders of the live router',
  mutating: true,
  input: noInput,
  result: OkSchema,
})

export const backDef = verbTool({
  verb: 'back',
  summary: 'go back one entry in the live router history',
  mutating: true,
  input: noInput,
  result: OkSchema,
})

export const TANSTACK_VERB_DEFS = [
  detectDef,
  routerStateDef,
  routeTreeDef,
  dataEntriesDef,
  dataGetDef,
  dataInvalidateDef,
  dataRefetchDef,
  errorsSnapshotDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  navigateDef,
  routerInvalidateDef,
  backDef,
] as const
