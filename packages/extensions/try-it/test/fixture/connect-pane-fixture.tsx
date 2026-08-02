import {defineExtension, HostApiProvider} from '@conciv/extension'
import type {JSX} from 'solid-js'
import {ConnectPane} from '../../src/client/connect-pane.js'

function ConnectPaneFixture(): JSX.Element {
  return (
    <HostApiProvider connect={{origin: window.location.origin, found: () => {}}}>
      <ConnectPane token="lna-fixture-token" />
    </HostApiProvider>
  )
}

export default defineExtension({name: 'try-it-connect-fixture', Component: ConnectPaneFixture}).client(() => ({
  value: {},
}))
