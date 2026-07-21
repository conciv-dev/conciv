import type {SourceLoc} from './page-introspect-types.js'

export type FrameworkName = 'nextjs' | 'tanstack-start' | 'vue' | 'solid-start' | 'astro'

export type RouterKind = 'app' | 'pages' | 'file-based' | 'unknown'

export type FrameworkInfo = {
  name: FrameworkName
  version: string | null
  router: RouterKind
  dev: boolean
}

export type RouteStatus = 'pending' | 'success' | 'error' | 'notFound' | 'redirected'

export type RouteMatch = {
  id: string
  routeId: string
  path: string
  params: Record<string, string>
  search: Record<string, unknown>
  status: RouteStatus
  error: string | null
  loaderData: unknown
  updatedAt: number | null
  isFetching: boolean
}

export type RouterLocation = {pathname: string; search: string; hash: string}

export type RouterCurrent = {location: RouterLocation; matches: RouteMatch[]}

export type RouteNodeKind = 'static' | 'dynamic' | 'catch-all' | 'layout' | 'index' | 'group'

export type RouteNode = {
  id: string
  path: string
  kind: RouteNodeKind
  hasLoader: boolean
  children: RouteNode[]
  truncated?: number
}

export type NavigateInput = {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  replace?: boolean
}

export type CacheEntryState = 'fresh' | 'stale' | 'fetching' | 'error'

export type CacheEntry = {
  key: string
  state: CacheEntryState
  status: string | null
  value: unknown
  updatedAt: number | null
  error: string | null
  observers: number | null
}

export type HydrationKind = 'rsc' | 'hydration' | 'flight'

export type HydrationSnapshot = {
  kind: HydrationKind
  tree: unknown
  mismatches: string[]
}

export type AppErrorKind = 'build' | 'runtime' | 'server' | 'hydration'

export type AppError = {
  id: string
  kind: AppErrorKind
  message: string
  stack: string | null
  source: SourceLoc | null
  digest: string | null
  at: number
}

export type ServerRouteKind = 'page' | 'api' | 'layout' | 'middleware'

export type ServerRouteInfo = {
  path: string
  kind: ServerRouteKind
  dynamic: boolean
  file: string | null
}

export type ServerFnInfo = {
  id: string
  name: string
  route: string | null
  file: string | null
}

export type ServerFnTrace = {
  id: string
  name: string
  durationMs: number
  status: 'ok' | 'error'
  at: number
}

export type IsrEntry = {
  path: string
  revalidateSeconds: number | null
  lastModified: number | null
  expired: boolean
}

export type RevalidateInput = {
  path?: string
  tag?: string
}

export type MiddlewareInfo = {
  path: string
  matcher: string[]
  file: string | null
}

export type FrameworkEventKind =
  | 'buildError'
  | 'runtimeError'
  | 'serverError'
  | 'hmrUpdate'
  | 'navigation'
  | 'requestTrace'

export type FrameworkEvent = {
  kind: FrameworkEventKind
  at: number
  message: string | null
  detail: unknown
}

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error'

export type LogSource = 'client' | 'server'

export type LogEntry = {
  level: LogLevel
  message: string
  source: LogSource
  at: number
}

export type Unsubscribe = () => void

export type FrameworkClientCore = {
  detect(): Promise<FrameworkInfo | null>
  routes: {
    current(): Promise<RouterCurrent>
    tree(): Promise<RouteNode>
  }
  navigation: {
    navigate(input: NavigateInput): Promise<void>
    back(): Promise<void>
    refresh(): Promise<void>
  }
  data: {
    entries(): Promise<CacheEntry[]>
    get(key: string): Promise<unknown>
    invalidate(key: string): Promise<void>
    refetch(key: string): Promise<void>
  }
  errors: {
    snapshot(): Promise<AppError[]>
  }
}

export type FrameworkServerCore = {
  manifest: {
    routes(): Promise<ServerRouteInfo[]>
  }
  errors: {
    snapshot(): Promise<AppError[]>
  }
  events: {
    subscribe(handler: (event: FrameworkEvent) => void): Unsubscribe
  }
  logs: {
    tail(count: number): Promise<LogEntry[]>
  }
}

export type QueryCacheSurface = {
  queries(): Promise<CacheEntry[]>
  mutations(): Promise<CacheEntry[]>
  invalidate(key: string): Promise<void>
  refetch(key: string): Promise<void>
}

export type PayloadSurface = {
  snapshot(): Promise<HydrationSnapshot>
}

export type ServerFunctionsSurface = {
  list(): Promise<ServerFnInfo[]>
  traces(count: number): Promise<ServerFnTrace[]>
}

export type IsrSurface = {
  entries(): Promise<IsrEntry[]>
  revalidate(input: RevalidateInput): Promise<void>
}

export type MiddlewareSurface = {
  list(): Promise<MiddlewareInfo[]>
}

export type FrameworkCapabilities = {
  queryCache: boolean
  serverFunctions: boolean
  rscPayload: boolean
  isr: boolean
  middleware: boolean
}

type FrameworkAdapterBase = {
  name: FrameworkName
  displayName?: string
  client: FrameworkClientCore
  server: FrameworkServerCore
}

export type FrameworkAdapter = FrameworkAdapterBase &
  (
    | {capabilities: FrameworkCapabilities & {queryCache: true}; queryCache: QueryCacheSurface}
    | {capabilities: FrameworkCapabilities & {queryCache: false}; queryCache?: undefined}
  ) &
  (
    | {capabilities: FrameworkCapabilities & {rscPayload: true}; payload: PayloadSurface}
    | {capabilities: FrameworkCapabilities & {rscPayload: false}; payload?: undefined}
  ) &
  (
    | {capabilities: FrameworkCapabilities & {serverFunctions: true}; serverFunctions: ServerFunctionsSurface}
    | {capabilities: FrameworkCapabilities & {serverFunctions: false}; serverFunctions?: undefined}
  ) &
  (
    | {capabilities: FrameworkCapabilities & {isr: true}; isr: IsrSurface}
    | {capabilities: FrameworkCapabilities & {isr: false}; isr?: undefined}
  ) &
  (
    | {capabilities: FrameworkCapabilities & {middleware: true}; middleware: MiddlewareSurface}
    | {capabilities: FrameworkCapabilities & {middleware: false}; middleware?: undefined}
  )

export function defineFrameworkAdapter<T extends FrameworkAdapter>(adapter: T): T {
  return adapter
}
