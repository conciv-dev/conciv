import {z} from 'zod'
import {Effect} from 'effect'
import type {EvlogError} from 'evlog'
import type {Live} from '@conciv/frontend-plugin-api'
import type {ReactTree} from '@conciv/frontend-plugin-api/page'
import {ErrorRingService, type ErrorRing} from './error-ring.js'
import {tanstackErrors} from './errors/errors.js'
import {invalidateQuery, readQueryCache, refetchQuery} from './query-adapter.js'
import {Action, SHORT_MAX, type Method, type Reply} from './rpc.js'
import {
  failureMessage,
  goBack,
  invalidateRouter,
  invalidateRouterMatch,
  navigateTo,
  readDataEntries,
  readDetect,
  readLoaderData,
  readRouterState,
  readRouteTree,
} from './router-adapter.js'

const REPLY_CODES: Record<string, string> = {
  [tanstackErrors.PAGE_PENDING.code]: 'page_pending',
  [tanstackErrors.PAGE_DISABLED.code]: 'page_disabled',
  [tanstackErrors.PAGE_FAILED.code]: 'page_failed',
  [tanstackErrors.ROUTER_NOT_FOUND.code]: 'router_not_found',
  [tanstackErrors.QUERY_CLIENT_NOT_FOUND.code]: 'query_client_not_found',
}

const JsonObject = z.record(z.string(), z.json())

const RESULT_MAX = 512_000

type ActionMap = {[Entry in Action as Entry['type']]: Entry}

type Handlers = {
  [Type in keyof ActionMap]: (tree: ReactTree, action: ActionMap[Type]) => Effect.Effect<unknown, EvlogError, ErrorRing>
}

const readErrors = Effect.fn('tanstack.operations.errors')(function* () {
  const ring = yield* ErrorRingService
  return yield* ring.read(RESULT_MAX)
})

const handlers: Handlers = {
  detect: (tree) => readDetect(tree),
  router_state: (tree) => readRouterState(tree),
  route_tree: (tree) => readRouteTree(tree),
  data_entries: (tree) => readDataEntries(tree),
  loader_data: (tree, action) => readLoaderData(tree, action.routeId),
  data_invalidate: (tree, action) => invalidateRouterMatch(tree, action.routeId),
  errors_snapshot: () => readErrors(),
  query_cache: (tree) => readQueryCache(tree),
  query_invalidate: (tree, action) => invalidateQuery(tree, action.key),
  query_refetch: (tree, action) => refetchQuery(tree, action.key),
  navigate: (tree, action) => navigateTo(tree, action),
  router_invalidate: (tree) => invalidateRouter(tree),
  back: (tree) => goBack(tree),
}

function perform<Type extends keyof ActionMap>(tree: ReactTree, type: Type, action: ActionMap[Type]) {
  return handlers[type](tree, action)
}

function invalidAction(cause: unknown) {
  return tanstackErrors.INVALID_ACTION({
    detail: failureMessage(cause),
    cause: cause instanceof Error ? cause : undefined,
  })
}

function requireTree(live: Live<ReactTree>): Effect.Effect<ReactTree, EvlogError> {
  if (live.status === 'active') return Effect.succeed(live.value)
  if (live.status === 'pending') return Effect.fail(tanstackErrors.PAGE_PENDING())
  if (live.reason === 'disabled') return Effect.fail(tanstackErrors.PAGE_DISABLED())
  return Effect.fail(tanstackErrors.PAGE_FAILED())
}

function failure(code: string, message: string): Reply {
  return {type: 'failure', code, message: message.slice(0, SHORT_MAX)}
}

function errorReply(error: EvlogError): Reply {
  const message = error.fix ? `${error.message} ${error.fix}` : error.message
  return failure(REPLY_CODES[error.code ?? ''] ?? 'handler_error', message)
}

const run = Effect.fn('tanstack.operations.run')(function* (name: Method, input: unknown, live: Live<ReactTree>) {
  const tree = yield* requireTree(live)
  const action = yield* Effect.try({
    try: () => Action.parse({...JsonObject.parse(input), type: name}),
    catch: invalidAction,
  })
  const result = yield* perform(tree, action.type, action)
  const value = yield* Effect.try({try: () => z.json().parse(result), catch: invalidAction})
  if ((JSON.stringify(value) ?? '').length > RESULT_MAX) return yield* Effect.fail(tanstackErrors.RESULT_TOO_LARGE())
  const reply: Reply = {type: 'success', value}
  return reply
})

export const execute = Effect.fn('tanstack.operations.execute')(function* (
  name: Method,
  input: unknown,
  live: Live<ReactTree>,
) {
  return yield* run(name, input, live).pipe(
    Effect.catch((error) => Effect.succeed(errorReply(error))),
    Effect.catchDefect((defect) => Effect.succeed(failure('handler_error', failureMessage(defect)))),
  )
})
