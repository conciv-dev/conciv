import type {AnyRouter} from '@tanstack/react-router'
import type {ReactFiber, ReactTree} from '@conciv/plugin/experimental/page'
import {Predicate} from 'effect'
import {mapValues} from 'es-toolkit'
import {
  RouteMatch,
  type CacheEntry,
  type CacheEntryState,
  type FrameworkInfo,
  type RouteNode,
  type RouteNodeKind,
  type RouterCurrent,
  type RouterLocation,
  type RouteStatus,
} from '../rpc.js'

const MAX_FIBER_NODES = 50_000
const MAX_TREE_DEPTH = 20

function isTanstackRouter(candidate: unknown): candidate is AnyRouter {
  if (!Predicate.isObject(candidate)) return false
  const state = candidate.state
  return (
    Predicate.isObject(state) &&
    Array.isArray(state.matches) &&
    Predicate.isFunction(candidate.navigate) &&
    Predicate.isFunction(candidate.buildLocation)
  )
}

function routerFromFiber(fiber: ReactFiber): AnyRouter | null {
  const props: unknown = fiber.memoizedProps
  const candidate = Predicate.isObject(props) ? props.router : undefined
  return isTanstackRouter(candidate) ? candidate : null
}

function walkFromRoot<T>(root: ReactFiber, pick: (fiber: ReactFiber) => T | null): T | null {
  const stack: ReactFiber[] = [root]
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

export function findInFibers<T>(tree: ReactTree, pick: (fiber: ReactFiber) => T | null): T | null {
  for (const root of tree.rootFibers()) {
    const picked = walkFromRoot(root, pick)
    if (picked !== null) return picked
  }
  return null
}

function findRouter(tree: ReactTree): AnyRouter | null {
  return findInFibers(tree, routerFromFiber)
}

function requireRouter(tree: ReactTree): AnyRouter {
  const router = findRouter(tree)
  if (!router) throw new Error('TanStack router not found on page')
  return router
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringRecord(value: unknown): Record<string, string> {
  if (!Predicate.isObject(value)) return {}
  return mapValues(value, (entry) => String(entry))
}

function unknownRecord(value: unknown): Record<string, unknown> {
  if (!Predicate.isObject(value)) return {}
  return mapValues(value, (entry) => entry)
}

function toStatus(value: unknown): RouteStatus {
  return RouteMatch.shape.status.catch('pending').parse(value)
}

export function errorMessage(value: unknown): string | null {
  if (!value) return null
  if (Predicate.isObject(value) && Predicate.isString(value.message)) return value.message
  return String(value)
}

function redactedPathname(tree: ReactTree, router: AnyRouter, match: unknown, pathname: string): string {
  if (!Predicate.isObject(match)) return pathname
  const params = unknownRecord(match.params)
  const redacted = unknownRecord(tree.dehydrate(params))
  if (JSON.stringify(redacted) === JSON.stringify(params)) return pathname
  return router.buildLocation({to: stringValue(match.fullPath), params: redacted}).pathname
}

function redactedMatchId(tree: ReactTree, router: AnyRouter, match: Record<string, unknown>): string {
  const pathname = redactedPathname(tree, router, match, stringValue(match.pathname))
  const deps = match.loaderDeps ? (JSON.stringify(tree.dehydrate(match.loaderDeps)) ?? '') : ''
  return stringValue(match.routeId) + pathname + deps
}

function mapMatch(tree: ReactTree, router: AnyRouter, match: unknown): RouteMatch {
  if (!Predicate.isObject(match))
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
    id: redactedMatchId(tree, router, match),
    routeId: stringValue(match.routeId),
    path: stringValue(match.fullPath),
    params: stringRecord(tree.dehydrate(match.params)),
    search: unknownRecord(tree.dehydrate(match.search)),
    status: toStatus(match.status),
    error: errorMessage(match.error),
    loaderData: tree.dehydrate(match.loaderData),
    updatedAt: typeof match.updatedAt === 'number' ? match.updatedAt : null,
    isFetching: Boolean(match.isFetching),
  }
}

function redactedSearchString(tree: ReactTree, router: AnyRouter, search: unknown): string {
  const stringify = router.options?.stringifySearch
  if (!Predicate.isFunction(stringify)) return ''
  return stringValue(stringify(unknownRecord(tree.dehydrate(search))))
}

function redactedHash(tree: ReactTree, hash: string): string {
  const pairs = [...new URLSearchParams(hash)]
  const redacted = pairs.map(([key, value]) => [key, stringValue(unknownRecord(tree.dehydrate({[key]: value}))[key])])
  if (redacted.every(([, value], index) => value === pairs[index]?.[1])) return hash
  return new URLSearchParams(redacted).toString()
}

function readLocation(tree: ReactTree, router: AnyRouter): RouterLocation {
  const location = unknownRecord(router.state.location)
  return {
    pathname: redactedPathname(tree, router, router.state.matches.at(-1), stringValue(location.pathname)),
    search: redactedSearchString(tree, router, location.search),
    hash: redactedHash(tree, stringValue(location.hash)),
  }
}

export function readRouterState(tree: ReactTree): RouterCurrent {
  const router = requireRouter(tree)
  return {
    location: readLocation(tree, router),
    matches: router.state.matches.map((match) => mapMatch(tree, router, match)),
  }
}

export function readDetect(tree: ReactTree): FrameworkInfo {
  requireRouter(tree)
  return {name: 'tanstack-start', version: null, router: 'file-based', dev: true}
}

function matchCacheState(match: Record<string, unknown>): CacheEntryState {
  if (match.isFetching) return 'fetching'
  if (match.status === 'error') return 'error'
  return 'fresh'
}

function matchToCacheEntry(tree: ReactTree, match: unknown): CacheEntry {
  if (!Predicate.isObject(match))
    return {key: '', state: 'fresh', status: null, value: null, updatedAt: null, error: null, observers: null}
  return {
    key: stringValue(match.routeId),
    state: matchCacheState(match),
    status: typeof match.status === 'string' ? match.status : null,
    value: tree.dehydrate(match.loaderData),
    updatedAt: typeof match.updatedAt === 'number' ? match.updatedAt : null,
    error: errorMessage(match.error),
    observers: null,
  }
}

export function readDataEntries(tree: ReactTree): {entries: CacheEntry[]} {
  const router = requireRouter(tree)
  return {entries: router.state.matches.map((match) => matchToCacheEntry(tree, match))}
}

function listChildren(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (Predicate.isObject(value)) return Object.values(value)
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
  if (!Predicate.isObject(route)) return {id: '', path: '', kind: 'static', hasLoader: false, children: []}
  const options = unknownRecord(route.options)
  const node: RouteNode = {
    id: stringValue(route.id),
    path: stringValue(route.path),
    kind: routeKind(stringValue(route.path), route.isRoot),
    hasLoader: Boolean(options.loader),
    children: [],
  }
  const children = listChildren(route.children)
  if (depth >= MAX_TREE_DEPTH) {
    if (children.length > 0) node.truncated = children.length
    return node
  }
  node.children = children.map((child) => mapRoute(child, depth + 1))
  return node
}

function findRootRoute(router: AnyRouter): unknown {
  if (Predicate.isObject(router.routeTree)) return router.routeTree
  const byId = router.routesById
  const rootNode = Predicate.isObject(byId) ? byId['__root__'] : undefined
  return Predicate.isObject(rootNode) ? rootNode : null
}

export function readRouteTree(tree: ReactTree): RouteNode {
  const router = requireRouter(tree)
  const root = findRootRoute(router)
  if (!root) throw new Error('TanStack router not found on page')
  return mapRoute(root, 0)
}

function pickMatch(matches: unknown[], routeId?: string): Record<string, unknown> | null {
  if (routeId !== undefined) {
    const named = matches.find((match) => Predicate.isObject(match) && match.routeId === routeId)
    return Predicate.isObject(named) ? named : null
  }
  const leaf = matches[matches.length - 1]
  return Predicate.isObject(leaf) ? leaf : null
}

export function readLoaderData(tree: ReactTree, routeId?: string): {routeId: string; data: unknown} {
  const router = requireRouter(tree)
  const match = pickMatch(router.state.matches, routeId)
  if (!match) return {routeId: routeId ?? '', data: null}
  return {routeId: stringValue(match.routeId), data: tree.dehydrate(match.loaderData)}
}

export async function navigateTo(
  tree: ReactTree,
  input: {
    to: string
    params?: Record<string, string>
    search?: Record<string, unknown>
    replace?: boolean
  },
): Promise<{ok: true; to: string}> {
  const router = requireRouter(tree)
  const options: Record<string, unknown> = {to: input.to}
  if (input.params !== undefined) options.params = input.params
  if (input.search !== undefined) options.search = input.search
  if (input.replace !== undefined) options.replace = input.replace
  await router.navigate(options)
  return {ok: true, to: input.to}
}

export async function invalidateRouter(tree: ReactTree): Promise<{ok: true}> {
  const router = requireRouter(tree)
  if (!Predicate.isFunction(router.invalidate)) throw new Error('TanStack router invalidate is not available')
  await router.invalidate()
  return {ok: true}
}

export async function invalidateRouterMatch(tree: ReactTree, routeId: string): Promise<{ok: true}> {
  const router = requireRouter(tree)
  if (!Predicate.isFunction(router.invalidate)) throw new Error('TanStack router invalidate is not available')
  await router.invalidate({filter: (match) => Predicate.isObject(match) && match.routeId === routeId})
  return {ok: true}
}

export function goBack(tree: ReactTree): {ok: true} {
  const router = requireRouter(tree)
  const history = router.history
  if (!Predicate.isFunction(history?.back)) throw new Error('TanStack router history.back is not available')
  history.back()
  return {ok: true}
}
