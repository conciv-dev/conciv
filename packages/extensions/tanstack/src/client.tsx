import {Show, type JSX} from 'solid-js'
import {Waypoints} from 'lucide-solid'
import {Tooltip} from '@conciv/ui-kit-system'
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
      <Tooltip.Root>
        <Tooltip.Trigger
          asChild={(triggerProps) => (
            <span
              {...triggerProps()}
              class="text-sm text-pw-text-2 px-2.5 rounded-pw-md bg-pw-fill-strong inline-flex gap-1.5 h-9 items-center"
            >
              <Waypoints size={14} aria-hidden="true" />
              {CONCIV_TANSTACK_CLIENT_SENTINEL}
            </span>
          )}
        />
        <Tooltip.Positioner>
          <Tooltip.Content>TanStack inspector active</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
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
