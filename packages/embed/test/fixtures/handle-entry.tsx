import {defineExtension, getExtensionApi, type RegisterExtension} from '@conciv/extension'
import {makeEventListener} from '@solid-primitives/event-listener'
import {from, type JSX} from 'solid-js'
import {Server, type Plugin} from '@conciv/plugin/experimental'
import {compose} from '@conciv/plugin/experimental/host'
import {createConciv, type ConcivHandle, type PluginEntry} from '../../src/mount.js'

declare global {
  interface WindowEventMap {
    'embedtest:connect': CustomEvent<{base: string}>
  }
}

const API_BASE_PROBE_NAME = 'api-base-probe'

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

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({extensions: [apiBaseProbe], apiBase})
}

const connectProbe: Plugin.Setup = (ctx) => {
  const found = from<string>((set) => makeEventListener(window, 'embedtest:connect', (event) => set(event.detail.base)))

  ctx.add(Server, (): Server => {
    const base = found()

    return {
      ready: true,
      order: 0,
      entries: [
        {
          id: 'core',
          name: 'conciv',
          state: base ? 'ready' : 'starting',
          ...(base ? {http: {url: base}} : {}),
          cover: () => (
            <output
              aria-label="connect pane ready"
              style={{position: 'fixed', bottom: '0', left: '0', 'pointer-events': 'none', opacity: '0'}}
            >
              ready
            </output>
          ),
        },
      ],
    }
  })
}

export function makeConnectHandle(): ConcivHandle {
  return createConciv({
    plugins: compose({'connect-probe': {windowEntry: async () => ({default: connectProbe})}}).map(
      (entry): PluginEntry => [entry, {}],
    ),
    settings: {defaultOpen: true},
  })
}

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof apiBaseProbe> {}
}
