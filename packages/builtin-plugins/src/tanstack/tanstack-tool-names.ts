import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {Method} from '@conciv/plugin-tanstack/rpc'
import type {tanstackCards} from './cards.js'

const TANSTACK_TOOL_PREFIX = 'tanstack_'

export function tanstackToolName<const Name extends Exclude<Method, `${string}.${string}`>>(
  operation: Name,
): `${typeof TANSTACK_TOOL_PREFIX}${Name}` {
  return `${TANSTACK_TOOL_PREFIX}${operation}`
}

const tanstackToolViews = {
  tanstack_router_state: {
    summary: "Read the running app's current TanStack Router state: matched routes, params, search and loader status.",
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the router state', done: 'Read the router state'},
  },
  tanstack_route_tree: {
    summary: "Read the running app's TanStack Router route tree: nested routes, their paths, kinds and loaders.",
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the route tree', done: 'Read the route tree'},
  },
  tanstack_route_manifest: {
    summary: "Read the app's route manifest from routeTree.gen: every defined route, path and dynamic segment.",
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the route manifest', done: 'Read the route manifest'},
  },
  tanstack_loader_data: {
    summary: 'Read the dehydrated loader data for the current or a named TanStack route.',
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the loader data', done: 'Read the loader data'},
  },
  tanstack_query_cache: {
    summary: "Read the running app's TanStack Query cache: each query's key, status, observers and data.",
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the query cache', done: 'Read the query cache'},
  },
  tanstack_build_errors: {
    summary: 'Read recent build and transform errors from the running TanStack dev server.',
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the build errors', done: 'Read the build errors'},
  },
  tanstack_server_fn_trace: {
    summary: 'Read recent TanStack server-function calls: which function ran, its duration and status.',
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the server-function calls', done: 'Read the server-function calls'},
  },
  tanstack_navigate: {
    summary: "Navigate the running app's TanStack Router to a path.",
    mutating: true,
    icon: 'pointer',
    label: {running: 'Navigating', done: 'Navigated'},
  },
  tanstack_back: {
    summary: "Navigate the running app's TanStack Router history back one entry.",
    mutating: true,
    icon: 'pointer',
    label: {running: 'Going back', done: 'Went back'},
  },
  tanstack_query_invalidate: {
    summary: 'Invalidate a TanStack Query by its serialized key.',
    mutating: true,
    icon: 'script',
    label: {running: 'Invalidating a query', done: 'Invalidated a query'},
  },
  tanstack_query_refetch: {
    summary: 'Refetch a TanStack Query by its serialized key.',
    mutating: true,
    icon: 'script',
    label: {running: 'Refetching a query', done: 'Refetched a query'},
  },
  tanstack_router_invalidate: {
    summary: 'Invalidate the TanStack Router so it re-runs the active loaders.',
    mutating: true,
    icon: 'script',
    label: {running: 'Invalidating the router', done: 'Invalidated the router'},
  },
} satisfies Record<keyof typeof tanstackCards, ToolViewMeta>

function isTanstackTool(name: string): name is keyof typeof tanstackToolViews {
  return Object.hasOwn(tanstackToolViews, name)
}

export function tanstackToolMeta(name: string): ToolViewMeta | undefined {
  return isTanstackTool(name) ? tanstackToolViews[name] : undefined
}
