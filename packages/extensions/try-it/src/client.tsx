import {defineExtension, getExtensionApi} from '@conciv/extension'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {Show} from 'solid-js'
import {ConnectPane} from './client/connect-pane.js'
import {preflight} from './shared/probe.js'

const TRY_IT_NAME = 'try-it'

export function tryIt(config: {token: string}) {
  const {useSlot, useConnect} = getExtensionApi(TRY_IT_NAME)
  return defineExtension({
    name: TRY_IT_NAME,
    connectGate: {preflight: () => preflight(config.token, 2500, connectPorts())},
    Component: () => (
      <Show when={useSlot() === 'connect'}>
        <ConnectPane token={config.token} connect={useConnect()} />
      </Show>
    ),
  }).client(() => ({value: {}}))
}

export default tryIt
