import {makeEventListener} from '@solid-primitives/event-listener'
import {from} from 'solid-js'
import {Server, type Plugin} from '@conciv/plugin/experimental'
import {compose} from '@conciv/plugin/experimental/host'
import {createConciv, type ConcivHandle, type PluginEntry} from '../../src/mount.js'

declare global {
  interface WindowEventMap {
    'embedtest:connect': CustomEvent<{base: string}>
  }
}

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({apiBase})
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
