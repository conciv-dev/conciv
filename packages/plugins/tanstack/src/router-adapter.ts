import type {AnyRoute, AnyRouteMatch, AnyRouter} from '@tanstack/react-router'
import type {ReactFiber, ReactTree} from '@conciv/plugin/experimental/page'
import {Effect, Predicate, Schema} from 'effect'
import {isUndefined, mapValues, omitBy} from 'es-toolkit'
import type {
  CacheEntry,
  CacheEntryState,
  FrameworkInfo,
  RouteMatch,
  RouteNode,
  RouteNodeKind,
  RouterCurrent,
  RouterLocation,
} from './rpc.js'

const RouterNotFound = Schema.TaggedStruct('Tanstack.RouterNotFound', {})
export type RouterNotFound = typeof RouterNotFound.Type

const HandlerFailed = Schema.TaggedStruct('Tanstack.HandlerFailed', {message: Schema.String})
export type HandlerFailed = typeof HandlerFailed.Type

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

function requireRouter(tree: ReactTree): Effect.Effect<AnyRouter, RouterNotFound> {
  const router = findRouter(tree)
  return router ? Effect.succeed(router) : Effect.fail(RouterNotFound.make({}))
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringRecord(value: unknown): Record<string, string> {
  if (!Predicate.isObject(value)) return {}
  return mapValues(value, (entry) => String(entry))
}

function unknownRecord(value: unknown): Record<string, unknown> {
  return Predicate.isObject(value) ? value : {}
}

export function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function callFailed(cause: unknown): HandlerFailed {
  return HandlerFailed.make({message: failureMessage(cause)})
}

export function errorMessage(value: unknown): string | null {
  if (!value) return null
  if (Predicate.isObject(value) && Predicate.isString(value.message)) return value.message
  return String(value)
}

function redactedPathname(
  tree: ReactTree,
  router: AnyRouter,
  match: AnyRouteMatch | undefined,
  pathname: string,
): string {
  if (!match) return pathname
  const params = unknownRecord(match.params)
  const redacted = unknownRecord(tree.dehydrate(params))
  if (JSON.stringify(redacted) === JSON.stringify(params)) return pathname
  const to: string = match.fullPath
  return router.buildLocation({to, params: redacted}).pathname
}

function redactedMatchId(tree: ReactTree, router: AnyRouter, match: AnyRouteMatch): string {
  const pathname = redactedPathname(tree, router, match, match.pathname)
  const deps = match.loaderDeps ? (JSON.stringify(tree.dehydrate(match.loaderDeps)) ?? '') : ''
  return match.routeId + pathname + deps
}

function mapMatch(tree: ReactTree, router: AnyRouter, match: AnyRouteMatch): RouteMatch {
  return {
    id: redactedMatchId(tree, router, match),
    routeId: match.routeId,
    path: match.fullPath,
    params: stringRecord(tree.dehydrate(match.params)),
    search: unknownRecord(tree.dehydrate(match.search)),
    status: match.status,
    error: errorMessage(match.error),
    loaderData: tree.dehydrate(match.loaderData),
    updatedAt: match.updatedAt,
    isFetching: Boolean(match.isFetching),
  }
}

function redactedSearchString(tree: ReactTree, router: AnyRouter, search: unknown): string {
  const stringify = router.options?.stringifySearch
  if (!Predicate.isFunction(stringify)) return ''
  return stringify(unknownRecord(tree.dehydrate(search)))
}

function redactedHash(tree: ReactTree, hash: string): string {
  const pairs = [...new URLSearchParams(hash)]
  const redacted = pairs.map(([key, value]) => [key, stringValue(unknownRecord(tree.dehydrate({[key]: value}))[key])])
  if (redacted.every(([, value], index) => value === pairs[index]?.[1])) return hash
  return new URLSearchParams(redacted).toString()
}

function readLocation(tree: ReactTree, router: AnyRouter): RouterLocation {
  const location = router.state.location
  return {
    pathname: redactedPathname(tree, router, router.state.matches.at(-1), location.pathname),
    search: redactedSearchString(tree, router, location.search),
    hash: redactedHash(tree, location.hash),
  }
}

export const readRouterState = Effect.fn('tanstack.router.state')(function* (tree: ReactTree) {
  const router = yield* requireRouter(tree)
  const current: RouterCurrent = {
    location: readLocation(tree, router),
    matches: router.state.matches.map((match) => mapMatch(tree, router, match)),
  }
  return current
})

export const readDetect = Effect.fn('tanstack.router.detect')(function* (tree: ReactTree) {
  yield* requireRouter(tree)
  const detected: FrameworkInfo = {name: 'tanstack-start', version: null, router: 'file-based', dev: true}
  return detected
})

function matchCacheState(match: AnyRouteMatch): CacheEntryState {
  if (match.isFetching) return 'fetching'
  if (match.status === 'error') return 'error'
  return 'fresh'
}

function matchToCacheEntry(tree: ReactTree, match: AnyRouteMatch): CacheEntry {
  return {
    key: match.routeId,
    state: matchCacheState(match),
    status: match.status,
    value: tree.dehydrate(match.loaderData),
    updatedAt: match.updatedAt,
    error: errorMessage(match.error),
    observers: null,
  }
}

export const readDataEntries = Effect.fn('tanstack.router.dataEntries')(function* (tree: ReactTree) {
  const router = yield* requireRouter(tree)
  return {entries: router.state.matches.map((match) => matchToCacheEntry(tree, match))}
})

function listChildren(children: AnyRoute['children']): AnyRoute[] {
  if (Array.isArray(children)) return children
  if (Predicate.isObjectKeyword(children)) return Object.values(children)
  return []
}

function lastSegment(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  return last ?? path
}

function routeKind(path: string, isRoot: boolean): RouteNodeKind {
  if (isRoot) return 'layout'
  if (path === '' || path === '/') return 'index'
  const segment = lastSegment(path)
  if (segment === '$') return 'catch-all'
  if (segment.startsWith('$')) return 'dynamic'
  return 'static'
}

function mapRoute(route: AnyRoute, depth: number): RouteNode {
  const path = stringValue(route.path)
  const node: RouteNode = {
    id: route.id,
    path,
    kind: routeKind(path, route.isRoot),
    hasLoader: Boolean(route.options.loader),
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

function findRootRoute(router: AnyRouter): AnyRoute | null {
  return router.routeTree ?? router.routesById?.['__root__'] ?? null
}

export const readRouteTree = Effect.fn('tanstack.router.routeTree')(function* (tree: ReactTree) {
  const router = yield* requireRouter(tree)
  const root = findRootRoute(router)
  if (!root) return yield* Effect.fail(RouterNotFound.make({}))
  return mapRoute(root, 0)
})

function pickMatch(matches: AnyRouteMatch[], routeId?: string): Effect.Effect<AnyRouteMatch, HandlerFailed> {
  const match = routeId === undefined ? matches.at(-1) : matches.find((candidate) => candidate.routeId === routeId)
  if (match) return Effect.succeed(match)
  if (routeId === undefined) return Effect.fail(HandlerFailed.make({message: 'No route is matched yet.'}))
  const known = matches.map((candidate) => candidate.routeId).join(', ')
  return Effect.fail(
    HandlerFailed.make({message: `No matched route has the id "${routeId}"; the matched routes are ${known}.`}),
  )
}

export const readLoaderData = Effect.fn('tanstack.router.loaderData')(function* (tree: ReactTree, routeId?: string) {
  const router = yield* requireRouter(tree)
  const match = yield* pickMatch(router.state.matches, routeId)
  return {routeId: match.routeId, data: match.loaderData === undefined ? null : tree.dehydrate(match.loaderData)}
})

type NavigateInput = {
  readonly to: string
  readonly params?: Record<string, string> | undefined
  readonly search?: Record<string, unknown> | undefined
  readonly replace?: boolean | undefined
}

export const navigateTo = Effect.fn('tanstack.router.navigate')(function* (tree: ReactTree, input: NavigateInput) {
  const router = yield* requireRouter(tree)
  const options: Record<string, unknown> = omitBy(
    {to: input.to, params: input.params, search: input.search, replace: input.replace},
    isUndefined,
  )
  yield* Effect.tryPromise({try: () => router.navigate(options), catch: callFailed})
  return {ok: true as const, to: input.to}
})

function requireInvalidate(router: AnyRouter): Effect.Effect<AnyRouter['invalidate'], HandlerFailed> {
  if (Predicate.isFunction(router.invalidate)) return Effect.succeed(router.invalidate.bind(router))
  return Effect.fail(HandlerFailed.make({message: 'TanStack router invalidate is not available'}))
}

export const invalidateRouter = Effect.fn('tanstack.router.invalidate')(function* (tree: ReactTree) {
  const router = yield* requireRouter(tree)
  const invalidate = yield* requireInvalidate(router)
  yield* Effect.tryPromise({try: () => invalidate(), catch: callFailed})
  return {ok: true as const}
})

export const invalidateRouterMatch = Effect.fn('tanstack.router.invalidateMatch')(function* (
  tree: ReactTree,
  routeId: string,
) {
  const router = yield* requireRouter(tree)
  const invalidate = yield* requireInvalidate(router)
  yield* Effect.tryPromise({
    try: () => invalidate({filter: (match) => match.routeId === routeId}),
    catch: callFailed,
  })
  return {ok: true as const}
})

export const goBack = Effect.fn('tanstack.router.back')(function* (tree: ReactTree) {
  const router = yield* requireRouter(tree)
  const history = router.history
  if (!Predicate.isFunction(history?.back))
    return yield* Effect.fail(HandlerFailed.make({message: 'TanStack router history.back is not available'}))
  yield* Effect.try({try: () => history.back(), catch: callFailed})
  return {ok: true as const}
})
