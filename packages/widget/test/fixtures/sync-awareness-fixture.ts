import {createClientSync} from '../../src/sync/client-sync.js'

const params = new URLSearchParams(location.search)
const room = createClientSync(location.origin, 'tok', {persist: false}).room('aw-room')
const awareness = room.awareness

const render = (): void => {
  const value = document.getElementById('value')
  if (!value) return
  const cursors = [...awareness.getStates().entries()]
    .filter(([id]) => id !== awareness.clientID)
    .map(([, peerState]) => (peerState as {cursor?: {x: number; y: number}}).cursor)
    .filter((cursor): cursor is {x: number; y: number} => Boolean(cursor))
    .map((cursor) => `cursor ${cursor.x},${cursor.y}`)
  value.textContent = cursors.join(' ')
}
awareness.on('change', render)
render()

const markReady = (): void => {
  if (!room.connected()) return void setTimeout(markReady, 30)
  const status = document.getElementById('status')
  if (status) status.textContent = 'reader-ready'
}
markReady()

const setCursor = params.get('setcursor')
const writeWhenConnected = (): void => {
  if (!room.connected()) return void setTimeout(writeWhenConnected, 30)
  const [x, y] = (setCursor ?? '').split(',').map(Number)
  awareness.setLocalStateField('cursor', {x, y})
}
if (setCursor) writeWhenConnected()
