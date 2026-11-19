import {z} from 'zod'
import {Effect, Schema} from 'effect'
import type {Live} from '@conciv/plugin/experimental'
import type {ReactTree} from '@conciv/plugin/experimental/page'
import {ErrorRingService, type ErrorRing} from './error-ring.js'
import {invalidateQuery, readQueryCache, refetchQuery, type QueryClientNotFound} from './query-adapter.js'
import {Action, SHORT_MAX, type Method, type Reply} from './rpc.js'
import {
  failureMessage,
  goBack,
  type HandlerFailed,
  invalidateRouter,
  invalidateRouterMatch,
  navigateTo,
  readDataEntries,
  readDetect,
  readLoaderData,
  readRouterState,
  readRouteTree,
  type RouterNotFound,
} from './router-adapter.js'

const PagePending = Schema.TaggedStruct('Tanstack.PagePending', {})
const PageDisabled = Schema.TaggedStruct('Tanstack.PageDisabled', {})
const PageFailed = Schema.TaggedStruct('Tanstack.PageFailed', {})
const InvalidAction = Schema.TaggedStruct('Tanstack.InvalidAction', {message: Schema.String})
const ResultTooLarge = Schema.TaggedStruct('Tanstack.ResultTooLarge', {})

type OperationError =
  | typeof PagePending.Type
  | typeof PageDisabled.Type
  | typeof PageFailed.Type
  | typeof InvalidAction.Type
  | typeof ResultTooLarge.Type
  | RouterNotFound
  | QueryClientNotFound
  | HandlerFailed

const JsonObject = z.record(z.string(), z.json())

const RESULT_MAX = 512_000

type ActionMap = {[Entry in Action as Entry['type']]: Entry}

type Handlers = {
  [Type in keyof ActionMap]: (
    tree: ReactTree,
    action: ActionMap[Type],
  ) => Effect.Effect<unknown, OperationError, ErrorRing>
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
  return InvalidAction.make({message: failureMessage(cause)})
}

function requireTree(live: Live<ReactTree>): Effect.Effect<ReactTree, OperationError> {
  if (live.status === 'active') return Effect.succeed(live.value)
  if (live.status === 'pending') return Effect.fail(PagePending.make({}))
  if (live.reason === 'disabled') return Effect.fail(PageDisabled.make({}))
  return Effect.fail(PageFailed.make({}))
}

function failure(code: string, message: string): Reply {
  return {type: 'failure', code, message: message.slice(0, SHORT_MAX)}
}

const run = Effect.fn('tanstack.operations.run')(function* (name: Method, input: unknown, live: Live<ReactTree>) {
  const tree = yield* requireTree(live)
  const action = yield* Effect.try({
    try: () => Action.parse({...JsonObject.parse(input), type: name}),
    catch: invalidAction,
  })
  const result = yield* perform(tree, action.type, action)
  const value = yield* Effect.try({try: () => z.json().parse(result), catch: invalidAction})
  if ((JSON.stringify(value) ?? '').length > RESULT_MAX) return yield* Effect.fail(ResultTooLarge.make({}))
  const reply: Reply = {type: 'success', value}
  return reply
})

export const execute = Effect.fn('tanstack.operations.execute')(function* (
  name: Method,
  input: unknown,
  live: Live<ReactTree>,
) {
  return yield* run(name, input, live).pipe(
    Effect.catchTags({
      'Tanstack.PagePending': () =>
        Effect.succeed(
          failure(
            'page_pending',
            'The page plugin is still starting in this tab; no action ran. Call tanstack.tabs.list({}) once it finishes starting, then retry.',
          ),
        ),
      'Tanstack.PageDisabled': () =>
        Effect.succeed(
          failure(
            'page_disabled',
            'The page plugin is disabled in this tab, so TanStack cannot read the React tree; no action ran. Ask the user to enable the page plugin, then call tanstack.tabs.list({}).',
          ),
        ),
      'Tanstack.PageFailed': () =>
        Effect.succeed(
          failure(
            'page_failed',
            'The page plugin failed to start in this tab, so TanStack cannot read the React tree; no action ran. Ask the user to reload the page, then call tanstack.tabs.list({}).',
          ),
        ),
      'Tanstack.RouterNotFound': () => Effect.succeed(failure('router_not_found', 'TanStack router not found on page')),
      'Tanstack.QueryClientNotFound': () =>
        Effect.succeed(failure('query_client_not_found', 'TanStack QueryClient not found on page')),
      'Tanstack.ResultTooLarge': () =>
        Effect.succeed(
          failure(
            'handler_error',
            'TanStack result exceeds 512000 JSON characters. Ask for one route with loader_data, or a single query key, instead of the whole cache. Repeating the same request will not reduce its output.',
          ),
        ),
      'Tanstack.InvalidAction': (error) => Effect.succeed(failure('handler_error', error.message)),
      'Tanstack.HandlerFailed': (error) => Effect.succeed(failure('handler_error', error.message)),
    }),
    Effect.catchDefect((defect) => Effect.succeed(failure('handler_error', failureMessage(defect)))),
  )
})
