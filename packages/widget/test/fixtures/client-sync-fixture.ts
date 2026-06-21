import {createClientSync} from '../../src/sync/client-sync.js'

const params = new URLSearchParams(location.search)
const room = createClientSync(location.origin, 'tok', {persist: false}).room('preview:session')
const data = room.doc.getMap('data')

const render = (): void => {
  const value = document.getElementById('value')
  if (value) value.textContent = String(data.get('k') ?? '')
}
data.observe(render)
render()

const markReady = (): void => {
  if (!room.connected()) return void setTimeout(markReady, 30)
  const status = document.getElementById('status')
  if (status) status.textContent = 'reader-ready'
}
markReady()

const write = params.get('write')
const writeWhenConnected = (): void => {
  if (!room.connected()) return void setTimeout(writeWhenConnected, 30)
  data.set('k', write ?? '')
}
if (write) writeWhenConnected()
