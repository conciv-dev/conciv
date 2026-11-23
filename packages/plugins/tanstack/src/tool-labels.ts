import {mapKeys} from 'es-toolkit'
import type {Method} from './rpc.js'

type ToolLabel = {readonly label: {readonly running: string; readonly done: string}}

const TANSTACK_TOOL_PREFIX = 'tanstack_'

type CardedMethod = Exclude<Method, `${string}.${string}`>

export function tanstackToolName<const Name extends CardedMethod>(
  operation: Name,
): `${typeof TANSTACK_TOOL_PREFIX}${Name}` {
  return `${TANSTACK_TOOL_PREFIX}${operation}`
}

const operationViews = {
  router_state: {
    label: {running: 'Reading the router state', done: 'Read the router state'},
  },
  route_tree: {
    label: {running: 'Reading the route tree', done: 'Read the route tree'},
  },
  loader_data: {
    label: {running: 'Reading the loader data', done: 'Read the loader data'},
  },
  query_cache: {
    label: {running: 'Reading the query cache', done: 'Read the query cache'},
  },
  navigate: {
    label: {running: 'Navigating', done: 'Navigated'},
  },
  back: {
    label: {running: 'Going back', done: 'Went back'},
  },
  query_invalidate: {
    label: {running: 'Invalidating a query', done: 'Invalidated a query'},
  },
  query_refetch: {
    label: {running: 'Refetching a query', done: 'Refetched a query'},
  },
  router_invalidate: {
    label: {running: 'Invalidating the router', done: 'Invalidated the router'},
  },
} satisfies Partial<Record<CardedMethod, ToolLabel>>

const tanstackToolViews = {
  ...mapKeys(operationViews, (_view, operation) => tanstackToolName(operation)),
  tanstack_route_manifest: {
    label: {running: 'Reading the route manifest', done: 'Read the route manifest'},
  },
  tanstack_build_errors: {
    label: {running: 'Reading the build errors', done: 'Read the build errors'},
  },
  tanstack_server_fn_trace: {
    label: {running: 'Reading the server-function calls', done: 'Read the server-function calls'},
  },
} satisfies Record<string, ToolLabel>

export type TanstackToolName = keyof typeof tanstackToolViews

function isTanstackTool(name: string): name is TanstackToolName {
  return Object.hasOwn(tanstackToolViews, name)
}

export function tanstackToolLabel(name: string): ToolLabel['label'] | undefined {
  return isTanstackTool(name) ? tanstackToolViews[name].label : undefined
}
