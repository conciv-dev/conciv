import {defineExtension} from '@conciv/extension'
import {tanstackVerbs} from './client/verbs.js'
import {
  backClient,
  loaderDataClient,
  navigateClient,
  queryCacheClient,
  queryInvalidateClient,
  queryRefetchClient,
  routeTreeClient,
  routerInvalidateClient,
  routerStateClient,
} from './tool/client.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [
    routerStateClient,
    routeTreeClient,
    loaderDataClient,
    queryCacheClient,
    navigateClient,
    routerInvalidateClient,
    backClient,
    queryInvalidateClient,
    queryRefetchClient,
  ],
}).client(() => ({
  value: {},
  pageVerbs: tanstackVerbs,
}))

export default tanstack
