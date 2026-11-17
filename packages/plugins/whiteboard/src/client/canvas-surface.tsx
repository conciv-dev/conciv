import {onMount, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import type {Context} from '@conciv/plugin/experimental'
import {Island} from '../canvas/island.js'
import {WhiteboardDbProvider} from './db.js'

function injectExcalidrawCss(doc: Document): void {
  if (doc.head.querySelector('[data-whiteboard-style]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-whiteboard-style', '')
  style.textContent = excalidrawCss
  doc.head.appendChild(style)
}

const insideExcalidraw = (event: KeyboardEvent): boolean => {
  const target = event.target
  return target instanceof Element && target.closest('.excalidraw') !== null
}

export default function CanvasSurface(props: {
  client: Context['client']
  room: string
  visible: boolean
  close: () => void
}): JSX.Element {
  injectExcalidrawCss(document)
  onMount(() =>
    makeEventListener(
      window,
      'keydown',
      (event) => {
        if (event.key === 'Escape' && props.visible && !insideExcalidraw(event)) props.close()
      },
      true,
    ),
  )
  return (
    <WhiteboardDbProvider client={props.client} room={props.room}>
      <Island doc={document} room={props.room} theme="dark" visible={props.visible} />
    </WhiteboardDbProvider>
  )
}
