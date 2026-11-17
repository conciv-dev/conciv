import type {JSX} from 'solid-js'
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

export default function CanvasSurface(props: {client: Context['client']; room: string}): JSX.Element {
  injectExcalidrawCss(document)
  return (
    <WhiteboardDbProvider client={props.client} room={props.room}>
      <Island doc={document} room={props.room} theme="dark" />
    </WhiteboardDbProvider>
  )
}
