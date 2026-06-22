import * as Y from 'yjs'
import {WebsocketProvider} from 'y-websocket'
import {convertToExcalidrawElements} from '@excalidraw/excalidraw'
import {mountIsland} from '../../src/canvas/island.js'
import {bindCanvasSync} from '../../src/canvas/canvas-sync.js'

const params = new URLSearchParams(location.search)
const doc = new Y.Doc()
const wsUrl = `${location.origin.replace(/^http/, 'ws')}/api/sync`
const provider = new WebsocketProvider(wsUrl, 'preview:session', doc, {connect: true, params: {token: 'tok'}})

const host = document.getElementById('host')
const shadow = host?.attachShadow({mode: 'open'})
const container = document.createElement('div')
container.style.position = 'fixed'
container.style.inset = '0'
shadow?.appendChild(container)

let writer: (e: readonly never[]) => void = () => {}
const handle = mountIsland({
  container,
  initialElements: [],
  onUserChange: (e) => writer(e as readonly never[]),
  onPointer: () => {},
  theme: 'light',
})
bindCanvasSync({doc, handle, onUserChange: (w) => void (writer = w as never)})

const count = document.getElementById('count')
const renderCount = (): void => {
  if (count) count.textContent = `scene:${handle.getSceneElements().length}`
  setTimeout(renderCount, 150)
}
renderCount()

const markReady = (): void => {
  if (!provider.wsconnected) return void setTimeout(markReady, 30)
  const status = document.getElementById('status')
  if (status) status.textContent = 'reader-ready'
}
markReady()

const drawWhenConnected = (): void => {
  if (!provider.wsconnected) return void setTimeout(drawWhenConnected, 30)
  const els = convertToExcalidrawElements([{type: 'rectangle', x: 10, y: 10, width: 80, height: 60}], {
    regenerateIds: true,
  })
  handle.updateScene({elements: els})
}
if (params.get('draw')) drawWhenConnected()
