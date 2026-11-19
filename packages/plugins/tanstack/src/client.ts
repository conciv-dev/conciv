import {mapKeys, mapValues} from 'es-toolkit'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {Operations, type Method} from './rpc.js'

const TANSTACK_TOOL_PREFIX = 'tanstack_'

type CardedMethod = Exclude<Method, `${string}.${string}`>

export function tanstackToolName<const Name extends CardedMethod>(
  operation: Name,
): `${typeof TANSTACK_TOOL_PREFIX}${Name}` {
  return `${TANSTACK_TOOL_PREFIX}${operation}`
}

function operationDescription(name: CardedMethod): string {
  const operation = Operations.find((candidate) => candidate.name === name)
  if (operation === undefined) throw new Error(`no tanstack operation named ${name}`)
  return operation.description
}

const operationViews = {
  router_state: {
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the router state', done: 'Read the router state'},
  },
  route_tree: {
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the route tree', done: 'Read the route tree'},
  },
  loader_data: {
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the loader data', done: 'Read the loader data'},
  },
  query_cache: {
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the query cache', done: 'Read the query cache'},
  },
  navigate: {
    mutating: true,
    icon: 'pointer',
    label: {running: 'Navigating', done: 'Navigated'},
  },
  back: {
    mutating: true,
    icon: 'pointer',
    label: {running: 'Going back', done: 'Went back'},
  },
  query_invalidate: {
    mutating: true,
    icon: 'script',
    label: {running: 'Invalidating a query', done: 'Invalidated a query'},
  },
  query_refetch: {
    mutating: true,
    icon: 'script',
    label: {running: 'Refetching a query', done: 'Refetched a query'},
  },
  router_invalidate: {
    mutating: true,
    icon: 'script',
    label: {running: 'Invalidating the router', done: 'Invalidated the router'},
  },
} satisfies Partial<Record<CardedMethod, Omit<ToolViewMeta, 'summary'>>>

const tanstackToolViews = {
  ...mapKeys(
    mapValues(operationViews, (view, operation): ToolViewMeta => ({...view, summary: operationDescription(operation)})),
    (_view, operation) => tanstackToolName(operation),
  ),
  tanstack_route_manifest: {
    summary: "Read the app's route manifest from routeTree.gen: every defined route, path and dynamic segment.",
    mutating: false,
    icon: 'read',
    label: {running: 'Reading the route manifest', done: 'Read the route manifest'},
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
} satisfies Record<string, ToolViewMeta>

export type TanstackToolName = keyof typeof tanstackToolViews

function isTanstackTool(name: string): name is TanstackToolName {
  return Object.hasOwn(tanstackToolViews, name)
}

export function tanstackToolMeta(name: string): ToolViewMeta | undefined {
  return isTanstackTool(name) ? tanstackToolViews[name] : undefined
}
