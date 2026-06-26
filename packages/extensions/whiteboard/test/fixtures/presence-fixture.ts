import * as Y from 'yjs'
import {WebsocketProvider} from 'y-websocket'
import {mountIsland} from '../../src/canvas/island.js'
import {bindPresence} from '../../src/canvas/presence.js'

const params = new URLSearchParams(location.search)
const room = params.get('room') ?? 'preview:session'
const name = params.get('name') ?? 'Guest'
const doc = new Y.Doc()
const wsUrl = `${location.origin.replace(/^http/, 'ws')}/api/sync`
const provider = new WebsocketProvider(wsUrl, room, doc, {connect: true, params: {token: 'tok'}})

const host = document.getElementById('host')
const shadow = host?.attachShadow({mode: 'open'})
const container = document.createElement('div')
container.style.position = 'fixed'
container.style.inset = '0'
shadow?.appendChild(container)

let setCursor: (x: number, y: number) => void = () => {}
const base = mountIsland({
  container,
  initialElements: [],
  onUserChange: () => {},
  onPointer: (p) => setCursor(p.x, p.y),
  theme: 'light',
})

const handle = {
  ...base,
  updateCollaborators: (collaborators: Parameters<typeof base.updateCollaborators>[0]) => {
    const values = [...collaborators.values()]
    const peers = document.getElementById('peers')
    if (peers)
      peers.textContent = `peers:${values.map((c) => c.username).join(',')} cursors:${values.filter((c) => c.pointer).length}`
    base.updateCollaborators(collaborators)
  },
}

const presence = bindPresence({
  awareness: provider.awareness,
  handle,
  self: {id: name, name, color: {background: '#a5d8ff', stroke: '#1971c2'}},
})
setCursor = presence.setCursor

const markReady = (): void => {
  if (!provider.wsconnected) return void setTimeout(markReady, 30)
  const status = document.getElementById('status')
  if (status) status.textContent = 'ready'
  if (params.get('move')) setCursor(200, 200)
}
markReady()
