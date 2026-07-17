import {defineExtension, getHostApi} from '@conciv/extension'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {Show} from 'solid-js'
import {ConnectPane} from './client/connect-pane.js'
import {preflight} from './shared/probe.js'

export function tryIt(config: {token: string}) {
  const {useSlot} = getHostApi()
  return defineExtension({
    name: 'try-it',
    connectGate: {preflight: () => preflight(config.token, 2500, connectPorts())},
    Component: () => (
      <Show when={useSlot() === 'connect'}>
        <ConnectPane token={config.token} />
      </Show>
    ),
  }).client(() => ({value: {}}))
}

export default tryIt
