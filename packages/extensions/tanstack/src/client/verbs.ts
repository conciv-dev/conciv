import {definePageVerbs, pageVerb} from '@conciv/extension'
import {z} from 'zod'
import {invalidateQuery, readMutations, readQueryCache, refetchQuery} from './query-adapter.js'
import {readRuntimeErrors} from './error-ring.js'
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

export const tanstackVerbs = definePageVerbs({
  detect: pageVerb(z.object({}), () => readDetect()),
  routerState: pageVerb(z.object({}), () => readRouterState()),
  routeTree: pageVerb(z.object({}), () => readRouteTree()),
  dataEntries: pageVerb(z.object({}), () => readDataEntries()),
  dataGet: pageVerb(z.object({routeId: z.string()}), (a) => readLoaderData(a.routeId)),
  dataInvalidate: pageVerb(z.object({routeId: z.string()}), (a) => invalidateRouterMatch(a.routeId)),
  dataRefetch: pageVerb(z.object({routeId: z.string()}), (a) => invalidateRouterMatch(a.routeId)),
  errorsSnapshot: pageVerb(z.object({}), () => readRuntimeErrors()),
  queryCache: pageVerb(z.object({}), () => ({queries: readQueryCache(), mutations: readMutations()})),
  queryInvalidate: pageVerb(z.object({key: z.string()}), (a) => invalidateQuery(a.key)),
  queryRefetch: pageVerb(z.object({key: z.string()}), (a) => refetchQuery(a.key)),
  navigate: pageVerb(
    z.object({
      to: z.string(),
      params: z.record(z.string(), z.string()).optional(),
      search: z.record(z.string(), z.unknown()).optional(),
      replace: z.boolean().optional(),
    }),
    (a) => navigateTo(a),
  ),
  routerInvalidate: pageVerb(z.object({}), () => invalidateRouter()),
  back: pageVerb(z.object({}), () => goBack()),
})
