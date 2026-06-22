import {convertToExcalidrawElements} from '@excalidraw/excalidraw'
import {mountIsland} from '../../src/canvas/island.js'
import {mountZoomControls} from '../../src/canvas/zoom-controls.js'

const host = document.getElementById('host')
const shadow = host?.attachShadow({mode: 'open'})
const container = document.createElement('div')
container.style.position = 'fixed'
container.style.inset = '0'
shadow?.appendChild(container)

const handle = mountIsland({
  container,
  initialElements: [],
  onUserChange: () => {},
  onPointer: () => {},
  theme: 'light',
})

const controls = mountZoomControls({handle, reducedMotion: () => true})
shadow?.appendChild(controls.el)

const els = convertToExcalidrawElements([{type: 'rectangle', x: 0, y: 0, width: 4000, height: 3000}], {
  regenerateIds: true,
})
const seed = (): void => {
  handle.updateScene({elements: els})
  if (handle.getSceneElements().length === 0) return void setTimeout(seed, 40)
  const marker = document.getElementById('seeded')
  if (marker) marker.textContent = 'seeded'
}
seed()
