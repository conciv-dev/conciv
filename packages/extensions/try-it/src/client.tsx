import {defineExtension, getExtensionApi} from '@conciv/extension'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {Show, type JSX} from 'solid-js'
import {ConnectPane} from './client/connect-pane.js'
import {preflight} from './shared/probe.js'

const TRY_IT_NAME = 'try-it'

const {useSlot, useConnect} = getExtensionApi(TRY_IT_NAME)

function ConnectSlot(props: {token: string}): JSX.Element {
  const connect = useConnect()
  return <ConnectPane token={props.token} connect={connect} />
}

export function tryIt(config: {token: string}) {
  return defineExtension({
    name: TRY_IT_NAME,
    connectGate: {preflight: () => preflight(config.token, 2500, connectPorts())},
    Component: () => (
      <Show when={useSlot() === 'connect'}>
        <ConnectSlot token={config.token} />
      </Show>
    ),
  }).client(() => ({value: {}}))
}

export default tryIt
