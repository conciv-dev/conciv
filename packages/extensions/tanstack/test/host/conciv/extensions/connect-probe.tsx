import {defineExtension, getHostApi} from '@conciv/extension'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Show, type JSX} from 'solid-js'

declare global {
  interface WindowEventMap {
    'embedtest:connect': CustomEvent<{base: string}>
  }
}

function ConnectPane(): JSX.Element {
  const connect = getHostApi().useConnect()
  makeEventListener(window, 'embedtest:connect', (event) => connect.found(event.detail.base))
  return <output aria-label="connect pane ready">ready</output>
}

const connectProbe = defineExtension({
  name: 'connect-probe',
  connectGate: {preflight: async () => null},
  Component: () => (
    <Show when={getHostApi().useSlot() === 'connect'}>
      <ConnectPane />
    </Show>
  ),
}).client(() => ({value: {}}))

export default connectProbe
