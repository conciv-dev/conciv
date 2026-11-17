import {z} from 'zod'
import type {Live} from '@conciv/plugin/experimental'
import type {ReactTree} from '@conciv/plugin/experimental/page'
import type {Action, Command, Outcome} from '../rpc.js'
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

async function perform(tree: ReactTree, action: Action): Promise<unknown> {
  switch (action.type) {
    case 'tabs.list':
      throw new Error('tanstack.tabs.list is answered by the engine, not the page')
    case 'detect':
      return readDetect(tree)
    case 'router_state':
      return readRouterState(tree)
    case 'route_tree':
      return readRouteTree(tree)
    case 'data_entries':
      return readDataEntries(tree)
    case 'loader_data':
      return readLoaderData(tree, action.routeId)
    case 'data_invalidate':
      return invalidateRouterMatch(tree, action.routeId)
    case 'errors_snapshot':
      return readRuntimeErrors()
    case 'query_cache':
      return {queries: readQueryCache(tree), mutations: readMutations(tree)}
    case 'query_invalidate':
      return invalidateQuery(tree, action.key)
    case 'query_refetch':
      return refetchQuery(tree, action.key)
    case 'navigate':
      return navigateTo(tree, action)
    case 'router_invalidate':
      return invalidateRouter(tree)
    case 'back':
      return goBack(tree)
  }
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
      const value = z.json().parse(await perform(live.value, command.action))
      return {type: 'success', result: {value}}
    } catch (error) {
      return {type: 'failure', code: 'handler-error', message: error instanceof Error ? error.message : String(error)}
    }
  }

  return {execute}
}
