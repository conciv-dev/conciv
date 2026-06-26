import {Show, createResource, onMount} from 'solid-js'
import {render} from 'solid-js/web'
import {convertToExcalidrawElements} from '@excalidraw/excalidraw'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import {mountIsland} from '../../src/canvas/island.js'
import {roomId} from '../../src/shared/room.js'
import {WhiteboardJazzProvider, fetchJazzConfig} from '../../src/client/jazz-client.js'
import {useCanvasBinding} from '../../src/client/canvas/binding.js'

declare global {
  interface Window {
    __CORE__: string
    drawLocal: () => void
  }
}

const params = new URLSearchParams(location.search)
const room = roomId('local', `mandarax_${params.get('session') ?? 'e2'}`)

const host = document.getElementById('host')!
const container = document.createElement('div')
container.style.cssText = 'position:fixed;inset:0'
host.appendChild(container)

let writer: (next: readonly OrderedExcalidrawElement[]) => void = () => {}
const handle = mountIsland({
  container,
  initialElements: [],
  onUserChange: (elements) => writer(elements),
  onPointer: () => {},
  theme: 'light',
})

const count = document.getElementById('count')!
const tick = (): void => {
  count.textContent = `scene:${handle.getSceneElements().length}`
  setTimeout(tick, 150)
}
tick()

window.drawLocal = () => {
  const elements = convertToExcalidrawElements([{type: 'ellipse', x: 20, y: 20, width: 60, height: 40}], {
    regenerateIds: true,
  })
  handle.updateScene({elements})
}

function Binding(props: {room: string}) {
  writer = useCanvasBinding({handle, room: () => props.room})
  onMount(() => {
    const marker = document.createElement('p')
    marker.textContent = 'ready'
    document.body.appendChild(marker)
  })
  return null
}

const [config] = createResource(() => fetchJazzConfig(`${window.__CORE__}/api/ext/whiteboard`))

render(
  () => (
    <Show when={config()}>
      {(ready) => (
        <WhiteboardJazzProvider config={ready()}>
          <Binding room={room} />
        </WhiteboardJazzProvider>
      )}
    </Show>
  ),
  document.getElementById('app')!,
)

export {}
