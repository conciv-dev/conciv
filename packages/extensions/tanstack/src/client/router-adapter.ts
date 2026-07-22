import {dehydrate, rootFibers} from '@conciv/page'
import type {
  CacheEntry,
  CacheEntryState,
  FrameworkInfo,
  RouteMatch,
  RouteNode,
  RouteNodeKind,
  RouterCurrent,
  RouterLocation,
  RouteStatus,
} from '@conciv/protocol/framework-types'

export type Fiber = {
  memoizedProps?: unknown
  child?: Fiber | null
  sibling?: Fiber | null
}

type InvalidateOptions = {filter?: (match: unknown) => boolean}

type TanstackRouter = {
  state: {matches: unknown[]; location: unknown}
  navigate: (input: unknown) => unknown
  invalidate?: (options?: InvalidateOptions) => unknown
  history?: {back?: () => unknown}
  routeTree?: unknown
  routesById?: unknown
}

const MAX_FIBER_NODES = 50_000
const MAX_TREE_DEPTH = 20

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isTanstackRouter(candidate: unknown): candidate is TanstackRouter {
  if (!isObject(candidate)) return false
  const state = candidate.state
  return isObject(state) && Array.isArray(state.matches) && typeof candidate.navigate === 'function'
}

function routerFromFiber(fiber: Fiber): TanstackRouter | null {
  const props: unknown = fiber.memoizedProps
  const candidate = isObject(props) ? props.router : undefined
  return isTanstackRouter(candidate) ? candidate : null
}

function walkFromRoot<T>(root: Fiber, pick: (fiber: Fiber) => T | null): T | null {
  const stack: Fiber[] = [root]
  let count = 0
  while (stack.length > 0 && count < MAX_FIBER_NODES) {
    const fiber = stack.pop()
    count++
    if (!fiber) continue
    const picked = pick(fiber)
    if (picked !== null) return picked
    if (fiber.child) stack.push(fiber.child)
    if (fiber.sibling) stack.push(fiber.sibling)
  }
  return null
}

export function findInFibers<T>(pick: (fiber: Fiber) => T | null): T | null {
  for (const root of rootFibers()) {
    const picked = walkFromRoot(root, pick)
    if (picked !== null) return picked
  }
  return null
}

function findRouter(): TanstackRouter | null {
  return findInFibers(routerFromFiber)
}

function requireRouter(): TanstackRouter {
  const router = findRouter()
  if (!router) throw new Error('TanStack router not found on page')
  return router
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) out[key] = typeof entry === 'string' ? entry : String(entry)
  return out
}

function unknownRecord(value: unknown): Record<string, unknown> {
  if (!isObject(value)) return {}
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) out[key] = entry
  return out
}

function toStatus(value: unknown): RouteStatus {
  if (value === 'success') return 'success'
  if (value === 'error') return 'error'
  if (value === 'notFound') return 'notFound'
  if (value === 'redirected') return 'redirected'
  return 'pending'
}

function errorMessage(value: unknown): string | null {
  if (!value) return null
  if (isObject(value) && typeof value.message === 'string') return value.message
  return String(value)
}

function mapMatch(match: unknown): RouteMatch {
  if (!isObject(match))
    return {
      id: '',
      routeId: '',
      path: '',
      params: {},
      search: {},
      status: 'pending',
      error: null,
      loaderData: null,
      updatedAt: null,
      isFetching: false,
    }
  return {
    id: stringValue(match.id),
    routeId: stringValue(match.routeId),
    path: stringValue(match.fullPath),
    params: stringRecord(match.params),
    search: unknownRecord(dehydrate(match.search)),
    status: toStatus(match.status),
    error: errorMessage(match.error),
    loaderData: dehydrate(match.loaderData),
    updatedAt: typeof match.updatedAt === 'number' ? match.updatedAt : null,
    isFetching: Boolean(match.isFetching),
  }
}

function locationOf(router: TanstackRouter): RouterLocation {
  const location = unknownRecord(router.state.location)
  return {
    pathname: stringValue(location.pathname),
    search: stringValue(location.searchStr),
    hash: stringValue(location.hash),
  }
}

export function readRouterState(): RouterCurrent {
  const router = requireRouter()
  return {location: locationOf(router), matches: router.state.matches.map(mapMatch)}
}

export function readDetect(): FrameworkInfo {
  requireRouter()
  return {name: 'tanstack-start', version: null, router: 'file-based', dev: true}
}

function matchCacheState(match: Record<string, unknown>): CacheEntryState {
  if (match.isFetching === true) return 'fetching'
  if (match.status === 'error') return 'error'
  return 'fresh'
}

function matchToCacheEntry(match: unknown): CacheEntry {
  if (!isObject(match))
    return {key: '', state: 'fresh', status: null, value: null, updatedAt: null, error: null, observers: null}
  return {
    key: stringValue(match.routeId),
    state: matchCacheState(match),
    status: typeof match.status === 'string' ? match.status : null,
    value: dehydrate(match.loaderData),
    updatedAt: typeof match.updatedAt === 'number' ? match.updatedAt : null,
    error: errorMessage(match.error),
    observers: null,
  }
}

export function readDataEntries(): CacheEntry[] {
  const router = requireRouter()
  return router.state.matches.map(matchToCacheEntry)
}

function childrenOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isObject(value)) return Object.values(value)
  return []
}

function lastSegment(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  return last ?? path
}

function routeKind(path: string, isRoot: unknown): RouteNodeKind {
  if (isRoot) return 'layout'
  if (path === '' || path === '/') return 'index'
  const segment = lastSegment(path)
  if (segment === '$') return 'catch-all'
  if (segment.startsWith('$')) return 'dynamic'
  return 'static'
}

function mapRoute(route: unknown, depth: number): RouteNode {
  if (!isObject(route)) return {id: '', path: '', kind: 'static', hasLoader: false, children: []}
  const options = unknownRecord(route.options)
  const node: RouteNode = {
    id: stringValue(route.id),
    path: stringValue(route.path),
    kind: routeKind(stringValue(route.path), route.isRoot),
    hasLoader: Boolean(options.loader),
    children: [],
  }
  const children = childrenOf(route.children)
  if (depth >= MAX_TREE_DEPTH) {
    if (children.length > 0) node.truncated = children.length
    return node
  }
  node.children = children.map((child) => mapRoute(child, depth + 1))
  return node
}

function rootRouteOf(router: TanstackRouter): unknown {
  if (isObject(router.routeTree)) return router.routeTree
  const byId = router.routesById
  const rootNode = isObject(byId) ? byId['__root__'] : undefined
  return isObject(rootNode) ? rootNode : null
}

export function readRouteTree(): RouteNode {
  const router = requireRouter()
  const root = rootRouteOf(router)
  if (!root) throw new Error('TanStack router not found on page')
  return mapRoute(root, 0)
}

function pickMatch(matches: unknown[], routeId?: string): Record<string, unknown> | null {
  if (routeId !== undefined) {
    const named = matches.find((match) => isObject(match) && match.routeId === routeId)
    return isObject(named) ? named : null
  }
  const leaf = matches[matches.length - 1]
  return isObject(leaf) ? leaf : null
}

export function readLoaderData(routeId?: string): unknown {
  const router = requireRouter()
  const match = pickMatch(router.state.matches, routeId)
  if (!match) return null
  return dehydrate(match.loaderData)
}

export async function navigateTo(input: {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
  replace?: boolean
}): Promise<{ok: true; to: string}> {
  const router = requireRouter()
  const options: Record<string, unknown> = {to: input.to}
  if (input.params !== undefined) options.params = input.params
  if (input.search !== undefined) options.search = input.search
  if (input.replace !== undefined) options.replace = input.replace
  await router.navigate(options)
  return {ok: true, to: input.to}
}

export async function invalidateRouter(): Promise<{ok: true}> {
  const router = requireRouter()
  if (typeof router.invalidate !== 'function') throw new Error('TanStack router invalidate is not available')
  await router.invalidate()
  return {ok: true}
}

export async function invalidateRouterMatch(routeId: string): Promise<{ok: true}> {
  const router = requireRouter()
  if (typeof router.invalidate !== 'function') throw new Error('TanStack router invalidate is not available')
  await router.invalidate({filter: (match) => isObject(match) && match.routeId === routeId})
  return {ok: true}
}

export function goBack(): {ok: true} {
  const router = requireRouter()
  const history = router.history
  if (!history || typeof history.back !== 'function') throw new Error('TanStack router history.back is not available')
  history.back()
  return {ok: true}
}
