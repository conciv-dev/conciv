import {For, Show, createResource} from 'solid-js'
import {render} from 'solid-js/web'
import {useAll} from 'jazz-tools/solid'
import {app} from '../../src/shared/schema.js'
import {roomId} from '../../src/shared/room.js'
import {WhiteboardJazzProvider, fetchJazzConfig} from '../../src/client/jazz-client.js'

declare global {
  interface Window {
    __CORE__: string
  }
}

const room = roomId('local', 'mandarax_e1seed')

function Probe() {
  const rows = useAll(() => ({query: app.canvasElements.where({room})}))
  return <For each={rows.data ?? []}>{(row) => <div>{row.elementId}</div>}</For>
}

const [config] = createResource(() => fetchJazzConfig(`${window.__CORE__}/api/ext/whiteboard`))

render(
  () => (
    <Show when={config()} fallback={<div>connecting</div>}>
      {(ready) => (
        <WhiteboardJazzProvider config={ready()}>
          <Probe />
        </WhiteboardJazzProvider>
      )}
    </Show>
  ),
  document.getElementById('host') ?? document.body,
)

export {}
