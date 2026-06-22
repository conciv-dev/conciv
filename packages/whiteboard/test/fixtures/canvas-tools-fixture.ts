import * as Y from 'yjs'
import {WebsocketProvider} from 'y-websocket'
import {mountIsland} from '../../src/canvas/island.js'
import {bindCanvasSync} from '../../src/canvas/canvas-sync.js'
import {bindAiDraws} from '../../src/canvas/ai-draws.js'

const params = new URLSearchParams(location.search)
const room = params.get('room') ?? 'preview:session'
const doc = new Y.Doc()
const wsUrl = `${location.origin.replace(/^http/, 'ws')}/api/sync`
new WebsocketProvider(wsUrl, room, doc, {connect: true, params: {token: 'tok'}})

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
bindAiDraws(doc)

const count = document.getElementById('count')
const renderCount = (): void => {
  if (count) count.textContent = `scene:${handle.getSceneElements().length}`
  setTimeout(renderCount, 150)
}
renderCount()
