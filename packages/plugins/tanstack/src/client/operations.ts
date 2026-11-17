import {z} from 'zod'
import type {Live} from '@conciv/plugin/experimental'
import type {ReactTree} from '@conciv/plugin/experimental/page'
import {SHORT_MAX, type Action, type Command, type Outcome} from '../rpc.js'
import {readRuntimeErrors} from './error-ring.js'
import {invalidateQuery, readMutations, readQueryCache, refetchQuery} from './query-adapter.js'
import {
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

export type TanstackOperations = {
  readonly execute: (command: Command, signal?: AbortSignal) => Promise<Outcome>
}

const PAGE_DISABLED: Outcome = {
  type: 'failure',
  code: 'page_disabled',
  message:
    'The page plugin is disabled in this tab, so TanStack cannot read the React tree; no action ran. Ask the user to enable the page plugin, then call tanstack.tabs.list({}).',
}

const PAGE_FAILED: Outcome = {
  type: 'failure',
  code: 'page_failed',
  message:
    'The page plugin failed to start in this tab, so TanStack cannot read the React tree; no action ran. Ask the user to reload the page, then call tanstack.tabs.list({}).',
}

const PAGE_PENDING: Outcome = {
  type: 'failure',
  code: 'page_pending',
  message:
    'The page plugin is still starting in this tab; no action ran. Call tanstack.tabs.list({}) once it finishes starting, then retry.',
}

const RESULT_MAX = 512_000

type ActionMap = {[Entry in Action as Entry['type']]: Entry}

type Handlers = {[Type in keyof ActionMap]: (tree: ReactTree, action: ActionMap[Type]) => unknown}

const handlers: Handlers = {
  'tabs.list': () => {
    throw new Error('tanstack.tabs.list is answered by the engine, not the page')
  },
  detect: (tree) => readDetect(tree),
  router_state: (tree) => readRouterState(tree),
  route_tree: (tree) => readRouteTree(tree),
  data_entries: (tree) => readDataEntries(tree),
  loader_data: (tree, action) => readLoaderData(tree, action.routeId),
  data_invalidate: (tree, action) => invalidateRouterMatch(tree, action.routeId),
  errors_snapshot: () => readRuntimeErrors(),
  query_cache: (tree) => ({queries: readQueryCache(tree), mutations: readMutations(tree)}),
  query_invalidate: (tree, action) => invalidateQuery(tree, action.key),
  query_refetch: (tree, action) => refetchQuery(tree, action.key),
  navigate: (tree, action) => navigateTo(tree, action),
  router_invalidate: (tree) => invalidateRouter(tree),
  back: (tree) => goBack(tree),
}

function perform<Type extends keyof ActionMap>(tree: ReactTree, type: Type, action: ActionMap[Type]): unknown {
  return handlers[type](tree, action)
}

function inactive(live: Exclude<Live<ReactTree>, {readonly status: 'active'}>): Outcome {
  if (live.status === 'pending') return PAGE_PENDING
  return live.reason === 'disabled' ? PAGE_DISABLED : PAGE_FAILED
}

export function makeTanstackOperations(tree: () => Live<ReactTree>): TanstackOperations {
  async function execute(command: Command, signal?: AbortSignal): Promise<Outcome> {
    const live = tree()
    if (live.status !== 'active') return inactive(live)
    try {
      signal?.throwIfAborted()
      const value = z.json().parse(await perform(live.value, command.action.type, command.action))
      if ((JSON.stringify(value) ?? '').length > RESULT_MAX)
        throw new Error(
          'TanStack result exceeds 512000 JSON characters. Ask for one route with loader_data, or a single query key, instead of the whole cache. Repeating the same request will not reduce its output.',
        )
      return {type: 'success', result: {value}}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {type: 'failure', code: 'handler_error', message: message.slice(0, SHORT_MAX)}
    }
  }

  return {execute}
}
