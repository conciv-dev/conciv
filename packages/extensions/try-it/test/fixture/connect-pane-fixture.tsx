import {defineExtension} from '@conciv/extension'
import type {JSX} from 'solid-js'
import {ConnectPane} from '../../src/client/connect-pane.js'

function ConnectPaneFixture(): JSX.Element {
  return <ConnectPane token="lna-fixture-token" connect={{origin: window.location.origin, found: () => {}}} />
}

export default defineExtension({name: 'try-it-connect-fixture', Component: ConnectPaneFixture}).client(() => ({
  value: {},
}))
