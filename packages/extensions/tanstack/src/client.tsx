import {defineExtension} from '@conciv/extension'
import {tanstackVerbs} from './client/verbs.js'
import {installRuntimeErrorListeners} from './client/error-ring.js'
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
  serverFnTraceClient,
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
    serverFnTraceClient,
  ],
}).client(() => ({
  value: {},
  pageVerbs: tanstackVerbs,
  dispose: installRuntimeErrorListeners(),
}))

export default tanstack
