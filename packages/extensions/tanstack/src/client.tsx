import {Show, type JSX} from 'solid-js'
import {Waypoints} from 'lucide-solid'
import {defineExtension, getHostApi} from '@conciv/extension'
import {CONCIV_TANSTACK_CLIENT_SENTINEL} from './client-sentinel.js'
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
      <span
        title="TanStack inspector active"
        class="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-pw-md text-pw-text-2 bg-pw-fill-strong text-sm"
      >
        <Waypoints size={14} />
        {CONCIV_TANSTACK_CLIENT_SENTINEL}
      </span>
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
