import {defineExtension, getExtensionApi} from '@conciv/extension'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Show, type JSX} from 'solid-js'

declare global {
  interface WindowEventMap {
    'embedtest:connect': CustomEvent<{base: string}>
  }
}

const CONNECT_PROBE_NAME = 'connect-probe'

const probeApi = getExtensionApi(CONNECT_PROBE_NAME)

function ConnectPane(): JSX.Element {
  const connect = probeApi.useConnect()
  makeEventListener(window, 'embedtest:connect', (event) => connect.found(event.detail.base))
  return <output aria-label="connect pane ready">ready</output>
}

const connectProbe = defineExtension({
  name: CONNECT_PROBE_NAME,
  connectGate: {preflight: async () => null},
  Component: () => (
    <Show when={probeApi.useSlot() === 'connect'}>
      <ConnectPane />
    </Show>
  ),
}).client(() => ({value: {}}))

export default connectProbe
