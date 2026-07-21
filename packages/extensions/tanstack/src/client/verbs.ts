import {definePageVerbs, pageVerb} from '@conciv/extension'
import {z} from 'zod'
import {invalidateQuery, readMutations, readQueryCache, refetchQuery} from './query-adapter.js'
import {goBack, invalidateRouter, navigateTo, readLoaderData, readRouterState, readRouteTree} from './router-adapter.js'

export const tanstackVerbs = definePageVerbs({
  routerState: pageVerb(z.object({}), () => readRouterState()),
  routeTree: pageVerb(z.object({}), () => readRouteTree()),
  loaderData: pageVerb(z.object({routeId: z.string().optional()}), (a) => readLoaderData(a.routeId)),
  queryCache: pageVerb(z.object({}), () => ({queries: readQueryCache(), mutations: readMutations()})),
  queryInvalidate: pageVerb(z.object({key: z.string()}), (a) => invalidateQuery(a.key)),
  queryRefetch: pageVerb(z.object({key: z.string()}), (a) => refetchQuery(a.key)),
  navigate: pageVerb(z.object({to: z.string(), replace: z.boolean().optional()}), (a) => navigateTo(a)),
  routerInvalidate: pageVerb(z.object({}), () => invalidateRouter()),
  back: pageVerb(z.object({}), () => goBack()),
})
