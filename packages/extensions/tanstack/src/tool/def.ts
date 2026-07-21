import {z} from 'zod'

export const RouterStateInput = z.object({})

export const RouteTreeInput = z.object({})

export const routerStateDef = {
  name: 'tanstack_router_state',
  description:
    "Read the running app's current TanStack Router state: matched routes, params, search, loader status. Use it to see what the user is looking at before acting.",
  inputSchema: RouterStateInput,
}

export const routeTreeDef = {
  name: 'tanstack_route_tree',
  description:
    "Read the running app's TanStack Router route tree: the nested route definitions, their paths, kinds, and which routes declare a loader. Use it to understand the app's routing structure.",
  inputSchema: RouteTreeInput,
}

export const LoaderDataInput = z.object({routeId: z.string().optional()})

export const loaderDataDef = {
  name: 'tanstack_loader_data',
  description:
    'Read the dehydrated loader data for the current (or a named) TanStack route — the server/loader-fetched data the route is rendering. Use it to see the data behind what the user sees.',
  inputSchema: LoaderDataInput,
}

export const QueryCacheInput = z.object({})

export const queryCacheDef = {
  name: 'tanstack_query_cache',
  description:
    "Read the running app's TanStack Query cache: each query's key, status (fresh/stale/fetching/error), observer count, and dehydrated data. Use it to see what data the app has fetched and cached.",
  inputSchema: QueryCacheInput,
}

export const NavigateInput = z.object({to: z.string(), replace: z.boolean().optional()})

export const navigateDef = {
  name: 'tanstack_navigate',
  description:
    "Navigate the running app's TanStack Router to a path. This changes what the user is currently viewing but destroys nothing — no data is deleted and you can navigate back.",
  inputSchema: NavigateInput,
}

export const RouterInvalidateInput = z.object({})

export const routerInvalidateDef = {
  name: 'tanstack_invalidate',
  description: 'Invalidate the TanStack Router (re-run active loaders).',
  inputSchema: RouterInvalidateInput,
}

export const BackInput = z.object({})

export const backDef = {
  name: 'tanstack_back',
  description: "Navigate the running app's TanStack Router history back one entry. Navigational.",
  inputSchema: BackInput,
}

export const QueryInvalidateInput = z.object({key: z.string()})

export const queryInvalidateDef = {
  name: 'tanstack_query_invalidate',
  description:
    'Invalidate a specific TanStack Query by its serialized key (JSON of the queryKey). Unknown keys are a no-op.',
  inputSchema: QueryInvalidateInput,
}

export const QueryRefetchInput = z.object({key: z.string()})

export const queryRefetchDef = {
  name: 'tanstack_query_refetch',
  description: 'Refetch a specific TanStack Query by its serialized key.',
  inputSchema: QueryRefetchInput,
}

export const BuildErrorsInput = z.object({})

export const buildErrorsDef = {
  name: 'tanstack_build_errors',
  description:
    "Read recent build/transform errors from the running TanStack dev server (compile failures, bad imports). Use it when the app is broken or a change didn't take effect.",
  inputSchema: BuildErrorsInput,
}

export const RouteManifestInput = z.object({})

export const routeManifestDef = {
  name: 'tanstack_route_manifest',
  description:
    "Read the app's route manifest from routeTree.gen (all defined routes, paths, dynamic segments). Use it to see what routes exist, not just the matched ones.",
  inputSchema: RouteManifestInput,
}

export const ServerFnTraceInput = z.object({count: z.number().int().positive().max(100).optional()})

export const serverFnTraceDef = {
  name: 'tanstack_server_fn_trace',
  description:
    'Read recent TanStack server-function calls: which server fn ran (file + export), duration, and status. Use it to see server-side data fetching triggered by the app.',
  inputSchema: ServerFnTraceInput,
}
