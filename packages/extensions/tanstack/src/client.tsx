import {Show, type JSX} from 'solid-js'
import {defineExtension, getExtensionApi} from '@conciv/extension'
import {InspectorChip} from './client/inspector-chip.js'
import {installRuntimeErrorListeners} from './client/error-ring.js'
import {tanstackClientTools} from './tool/client.js'

export {CONCIV_TANSTACK_CLIENT_SENTINEL} from './client-sentinel.js'

const TANSTACK_NAME = 'tanstack'

function Component(): JSX.Element {
  const slot = getExtensionApi(TANSTACK_NAME).useSlot()
  return (
    <Show when={slot === 'status'}>
      <InspectorChip />
    </Show>
  )
}

export const tanstack = defineExtension({
  name: TANSTACK_NAME,
  Component,
  tools: [...tanstackClientTools],
}).client(() => ({
  value: {},
  dispose: installRuntimeErrorListeners(),
}))

export default tanstack
