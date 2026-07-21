import {defineExtension} from '@conciv/extension'
import {tanstackVerbs} from './client/verbs.js'
import {
  backClient,
  buildErrorsClient,
  loaderDataClient,
  navigateClient,
  queryCacheClient,
  queryInvalidateClient,
  queryRefetchClient,
  routeManifestClient,
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
    buildErrorsClient,
    routeManifestClient,
  ],
}).client(() => ({
  value: {},
  pageVerbs: tanstackVerbs,
}))

export default tanstack
