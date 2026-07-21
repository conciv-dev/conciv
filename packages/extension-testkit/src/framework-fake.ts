import {
  defineFrameworkAdapter,
  type AppError,
  type CacheEntry,
  type FrameworkAdapter,
  type FrameworkClientCore,
  type FrameworkInfo,
  type FrameworkName,
  type FrameworkServerCore,
  type LogEntry,
  type QueryCacheSurface,
  type RouteNode,
  type RouterCurrent,
  type ServerFnInfo,
  type ServerFnTrace,
  type ServerFunctionsSurface,
  type ServerRouteInfo,
} from '@conciv/protocol/framework-types'

const fakeFrameworkInfo: FrameworkInfo = {name: 'tanstack-start', version: '1.4.2', router: 'file-based', dev: true}

const fakeRouterCurrent: RouterCurrent = {
  location: {pathname: '/posts/42', search: '?tab=comments', hash: ''},
  matches: [
    {
      id: 'root',
      routeId: '__root__',
      path: '/',
      params: {},
      search: {},
      status: 'success',
      error: null,
      loaderData: null,
      staleAt: null,
      isFetching: false,
    },
    {
      id: 'posts-42',
      routeId: '/posts/$postId',
      path: '/posts/42',
      params: {postId: '42'},
      search: {tab: 'comments'},
      status: 'success',
      error: null,
      loaderData: {title: 'Hello world'},
      staleAt: 1_700_000_000_000,
      isFetching: false,
    },
  ],
}

const fakeRouteTree: RouteNode = {
  id: '__root__',
  path: '/',
  kind: 'layout',
  hasLoader: false,
  children: [
    {id: '/', path: '/', kind: 'index', hasLoader: false, children: []},
    {id: '/posts/$postId', path: '/posts/$postId', kind: 'dynamic', hasLoader: true, children: []},
  ],
}

const fakeLoaderData: unknown = {title: 'Hello world', comments: 3}

const fakeCacheEntries: CacheEntry[] = [
  {
    key: '["posts",42]',
    state: 'fresh',
    status: 'success',
    value: {title: 'Hello world'},
    updatedAt: 1_700_000_000_000,
    error: null,
    observers: 1,
  },
]

const fakeMutationEntries: CacheEntry[] = [
  {
    key: '["createPost"]',
    state: 'fetching',
    status: 'pending',
    value: null,
    updatedAt: null,
    error: null,
    observers: 0,
  },
]

const fakeAppErrors: AppError[] = [
  {
    id: 'err-1',
    kind: 'build',
    message: 'Unexpected token',
    stack: null,
    source: {file: 'src/routes/posts.tsx', line: 12, column: 4},
    digest: null,
    at: 1_700_000_000_000,
  },
]

const fakeServerRoutes: ServerRouteInfo[] = [
  {path: '/', kind: 'page', dynamic: false, file: 'src/routes/index.tsx'},
  {path: '/posts/$postId', kind: 'page', dynamic: true, file: 'src/routes/posts.$postId.tsx'},
  {path: '/api/health', kind: 'api', dynamic: false, file: 'src/routes/api/health.ts'},
]

const fakeServerFns: ServerFnInfo[] = [
  {id: 'fn-createPost', name: 'createPost', route: '/posts/$postId', file: 'src/routes/posts.$postId.tsx'},
]

const fakeServerFnTraces: ServerFnTrace[] = [
  {id: 'fn-createPost', name: 'createPost', durationMs: 12.5, status: 'ok', at: 1_700_000_000_000},
]

const fakeLogEntries: LogEntry[] = [{level: 'info', message: 'server started', source: 'server', at: 1_700_000_000_000}]

const defaultClient: FrameworkClientCore = {
  detect: async () => fakeFrameworkInfo,
  routes: {
    current: async () => fakeRouterCurrent,
    tree: async () => fakeRouteTree,
  },
  navigation: {
    navigate: async () => {},
    back: async () => {},
    refresh: async () => {},
  },
  data: {
    entries: async () => fakeCacheEntries,
    get: async () => fakeLoaderData,
    invalidate: async () => {},
    refetch: async () => {},
  },
  errors: {
    snapshot: async () => fakeAppErrors,
  },
}

const defaultServer: FrameworkServerCore = {
  manifest: {
    routes: async () => fakeServerRoutes,
  },
  errors: {
    snapshot: async () => fakeAppErrors,
  },
  events: {
    subscribe: () => () => {},
  },
  logs: {
    tail: async () => fakeLogEntries,
  },
}

const defaultQueryCache: QueryCacheSurface = {
  queries: async () => fakeCacheEntries,
  mutations: async () => fakeMutationEntries,
  invalidate: async () => {},
  refetch: async () => {},
}

const defaultServerFunctions: ServerFunctionsSurface = {
  list: async () => fakeServerFns,
  traces: async () => fakeServerFnTraces,
}

export type FrameworkAdapterOverrides = {
  name?: FrameworkName
  displayName?: string
  client?: {
    detect?: FrameworkClientCore['detect']
    routes?: Partial<FrameworkClientCore['routes']>
    navigation?: Partial<FrameworkClientCore['navigation']>
    data?: Partial<FrameworkClientCore['data']>
    errors?: Partial<FrameworkClientCore['errors']>
  }
  server?: {
    manifest?: Partial<FrameworkServerCore['manifest']>
    errors?: Partial<FrameworkServerCore['errors']>
    events?: Partial<FrameworkServerCore['events']>
    logs?: Partial<FrameworkServerCore['logs']>
  }
  queryCache?: Partial<QueryCacheSurface>
  serverFunctions?: Partial<ServerFunctionsSurface>
}

export function makeFakeFrameworkAdapter(overrides?: FrameworkAdapterOverrides): FrameworkAdapter {
  const client = overrides?.client
  const server = overrides?.server
  return defineFrameworkAdapter({
    name: overrides?.name ?? 'tanstack-start',
    displayName: overrides?.displayName ?? 'Fake Framework',
    capabilities: {queryCache: true, serverFunctions: true, rscPayload: false, isr: false, middleware: false},
    client: {
      ...defaultClient,
      ...client,
      routes: {...defaultClient.routes, ...client?.routes},
      navigation: {...defaultClient.navigation, ...client?.navigation},
      data: {...defaultClient.data, ...client?.data},
      errors: {...defaultClient.errors, ...client?.errors},
    },
    queryCache: {...defaultQueryCache, ...overrides?.queryCache},
    serverFunctions: {...defaultServerFunctions, ...overrides?.serverFunctions},
    server: {
      ...defaultServer,
      ...server,
      manifest: {...defaultServer.manifest, ...server?.manifest},
      errors: {...defaultServer.errors, ...server?.errors},
      events: {...defaultServer.events, ...server?.events},
      logs: {...defaultServer.logs, ...server?.logs},
    },
  })
}
