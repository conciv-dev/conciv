import {Show, createResource} from 'solid-js'
import {render} from 'solid-js/web'
import {useAll} from 'jazz-tools/solid'
import {mountIsland} from '../../src/canvas/island.js'
import {roomId} from '../../src/shared/room.js'
import {app} from '../../src/shared/schema.js'
import {WhiteboardJazzProvider, fetchJazzConfig} from '../../src/client/jazz-client.js'
import {useCursorPresence, type Self} from '../../src/client/canvas/presence.js'

declare global {
  interface Window {
    __CORE__: string
    __ready: boolean
    move: (x: number, y: number) => void
  }
}

const params = new URLSearchParams(location.search)
const room = roomId('local', `mandarax_${params.get('room') ?? 'pres'}`)
const self: Self = {sessionId: crypto.randomUUID(), name: params.get('name') ?? 'Guest', color: '#1971c2'}

const host = document.getElementById('host') ?? document.body
const container = document.createElement('div')
container.style.cssText = 'position:fixed;inset:0'
host.appendChild(container)

let pointer: (point: {x: number; y: number}) => void = () => {}
const handle = mountIsland({
  container,
  initialElements: [],
  onUserChange: () => {},
  onPointer: (point) => pointer(point),
  theme: 'light',
})

function Peers() {
  const peers = useAll(() => ({query: app.cursors.where({room})}))
  const others = () => (peers.data ?? []).filter((cursor) => cursor.sessionId !== self.sessionId)
  return (
    <p>
      peers:
      {others()
        .map((cursor) => cursor.name)
        .join(',')}{' '}
      cursors:{others().length}
    </p>
  )
}

function Presence() {
  const setCursor = useCursorPresence({handle, room: () => room, self})
  pointer = (point) => setCursor(point.x, point.y)
  window.move = (x, y) => setCursor(x, y)
  window.__ready = true
  return <Peers />
}

const [config] = createResource(() => fetchJazzConfig(`${window.__CORE__}/api/ext/whiteboard`))

render(
  () => (
    <Show when={config()}>
      {(ready) => (
        <WhiteboardJazzProvider config={ready()}>
          <Presence />
        </WhiteboardJazzProvider>
      )}
    </Show>
  ),
  document.getElementById('app') ?? document.body,
)

export {}
