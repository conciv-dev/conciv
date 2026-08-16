import {Show, type JSX} from 'solid-js'
import {defineExtension, getExtensionApi} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'
import {InspectorChip} from './client/inspector-chip.js'
import {tanstackVerbTools} from './client/verbs.js'
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

const TANSTACK_NAME = 'tanstack'

function Component(): JSX.Element {
  const slot = getExtensionApi(TANSTACK_NAME).useSlot()
  return (
    <Show when={slot === 'composer'}>
      <ComposerActions.Inline priority={10}>
        <InspectorChip />
      </ComposerActions.Inline>
    </Show>
  )
}

export const tanstack = defineExtension({
  name: TANSTACK_NAME,
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
    ...tanstackVerbTools,
  ],
}).client(() => ({
  value: {},
  dispose: installRuntimeErrorListeners(),
}))

export default tanstack
