import {definePageVerbs, pageVerb} from '@conciv/extension'
import {z} from 'zod'
import {readRouterState, readRouteTree} from './router-adapter.js'

export const tanstackVerbs = definePageVerbs({
  routerState: pageVerb(z.object({}), () => readRouterState()),
  routeTree: pageVerb(z.object({}), () => readRouteTree()),
})
