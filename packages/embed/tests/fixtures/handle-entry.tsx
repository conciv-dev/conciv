import terminal from '@conciv/extension-terminal/client'
import {defineExtension, getExtensionApi, type RegisterExtension} from '@conciv/extension'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Show, type JSX} from 'solid-js'
import {createConciv, type ConcivHandle} from '../../src/mount.js'

declare global {
  interface WindowEventMap {
    'embedtest:connect': CustomEvent<{base: string}>
  }
}

const API_BASE_PROBE_NAME = 'api-base-probe'
const MOUNT_PROBE_NAME = 'mount-probe'
const CONNECT_GATE_PROBE_NAME = 'connect-gate-probe'

function ApiBaseProbe(): JSX.Element {
  const apiBase = getExtensionApi(API_BASE_PROBE_NAME).useApiBase()
  return (
    <output
      aria-label="host api base probe"
      style={{position: 'fixed', bottom: '0', left: '0', 'pointer-events': 'none', opacity: '0'}}
    >
      {apiBase()}
    </output>
  )
}

const apiBaseProbe = defineExtension({name: API_BASE_PROBE_NAME, Surface: ApiBaseProbe}).client(() => ({value: {}}))

function mountBaseProbe(label: string): () => JSX.Element {
  return () => {
    const mountedBase = getExtensionApi(MOUNT_PROBE_NAME).useApiBase()()
    return (
      <output aria-label={label} style={{position: 'fixed', bottom: '0', right: '0', opacity: '0'}}>
        {mountedBase}
      </output>
    )
  }
}

const mountProbe = defineExtension({
  name: MOUNT_PROBE_NAME,
  Surface: mountBaseProbe('surface mount api base'),
  views: [{id: MOUNT_PROBE_NAME, label: 'Mount probe', Component: mountBaseProbe('view mount api base')}],
}).client(() => ({value: {}}))

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({extensions: [terminal, apiBaseProbe, mountProbe], apiBase})
}

function ConnectPane(): JSX.Element {
  const connect = getExtensionApi(CONNECT_GATE_PROBE_NAME).useConnect()
  makeEventListener(window, 'embedtest:connect', (event) => connect.found(event.detail.base))
  return (
    <output
      aria-label="connect pane ready"
      style={{position: 'fixed', bottom: '0', left: '0', 'pointer-events': 'none', opacity: '0'}}
    >
      ready
    </output>
  )
}

const connectGateProbe = defineExtension({
  name: CONNECT_GATE_PROBE_NAME,
  connectGate: {preflight: async () => null},
  Component: () => (
    <Show when={getExtensionApi(CONNECT_GATE_PROBE_NAME).useSlot() === 'connect'}>
      <ConnectPane />
    </Show>
  ),
}).client(() => ({value: {}}))

export function makeConnectHandle(): ConcivHandle {
  return createConciv({extensions: [connectGateProbe], settings: {defaultOpen: true}})
}

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry
    extends
      RegisterExtension<typeof apiBaseProbe>,
      RegisterExtension<typeof mountProbe>,
      RegisterExtension<typeof connectGateProbe> {}
}
