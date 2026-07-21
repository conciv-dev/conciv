import {dehydrate, rootFibers} from '@conciv/page'
import type {RouteMatch, RouteNode, RouteNodeKind, RouteStatus} from '@conciv/protocol/framework-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bippy fibers are untyped internals
type Fiber = any

type TanstackRouter = {
  state: {matches: unknown[]; location: unknown}
  navigate: (input: unknown) => unknown
  routeTree?: unknown
  routesById?: unknown
}

export type RouterLocation = {pathname: string; search: string; hash: string}

export type RouterStateResult = {location: RouterLocation; matches: RouteMatch[]}

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

function walkForRouter(root: Fiber): TanstackRouter | null {
  const stack: Fiber[] = [root]
  let count = 0
  while (stack.length > 0 && count < MAX_FIBER_NODES) {
    const fiber = stack.pop()
    count++
    if (!fiber) continue
    const router = routerFromFiber(fiber)
    if (router) return router
    if (fiber.child) stack.push(fiber.child)
    if (fiber.sibling) stack.push(fiber.sibling)
  }
  return null
}

function findRouter(): TanstackRouter | null {
  for (const root of rootFibers()) {
    const router = walkForRouter(root)
    if (router) return router
  }
  return null
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
      staleAt: null,
      isFetching: false,
    }
  return {
    id: stringValue(match.id),
    routeId: stringValue(match.routeId),
    path: stringValue(match.fullPath),
    params: stringRecord(match.params),
    search: unknownRecord(match.search),
    status: toStatus(match.status),
    error: errorMessage(match.error),
    loaderData: dehydrate(match.loaderData),
    staleAt: typeof match.updatedAt === 'number' ? match.updatedAt : null,
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

export function readRouterState(): RouterStateResult {
  const router = requireRouter()
  return {location: locationOf(router), matches: router.state.matches.map(mapMatch)}
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
  return dehydrate(match?.loaderData)
}
