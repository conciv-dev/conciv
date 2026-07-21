import {definePageVerbs, pageVerb} from '@conciv/extension'
import {z} from 'zod'
import {readLoaderData, readRouterState, readRouteTree} from './router-adapter.js'

export const tanstackVerbs = definePageVerbs({
  routerState: pageVerb(z.object({}), () => readRouterState()),
  routeTree: pageVerb(z.object({}), () => readRouteTree()),
  loaderData: pageVerb(z.object({routeId: z.string().optional()}), (a) => readLoaderData(a.routeId)),
})
