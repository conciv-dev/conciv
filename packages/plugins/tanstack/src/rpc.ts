import {z} from 'zod'

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
