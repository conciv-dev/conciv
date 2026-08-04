import {Show, type JSX} from 'solid-js'
import {defineExtension, getHostApi} from '@conciv/extension'
import {InspectorChip} from './client/inspector-chip.js'
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

export {CONCIV_TANSTACK_CLIENT_SENTINEL} from './client-sentinel.js'

function Component(): JSX.Element {
  const slot = getHostApi().useSlot()
  return (
    <Show when={slot === 'composer'}>
      <InspectorChip />
    </Show>
  )
}

export const tanstack = defineExtension({
  name: 'tanstack',
  Component,
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
