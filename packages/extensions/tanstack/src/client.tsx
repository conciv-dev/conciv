import {defineExtension} from '@conciv/extension'
import {tanstackVerbs} from './client/verbs.js'
import {loaderDataClient, queryCacheClient, routeTreeClient, routerStateClient} from './tool/client.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [routerStateClient, routeTreeClient, loaderDataClient, queryCacheClient],
}).client(() => ({
  value: {},
  pageVerbs: tanstackVerbs,
}))

export default tanstack
