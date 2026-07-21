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
