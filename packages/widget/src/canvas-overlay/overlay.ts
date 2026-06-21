import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {createSignal} from 'solid-js'
import {render} from 'solid-js/web'
import {Excalidraw} from '@excalidraw/excalidraw'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import {createCanvasDoc, type CanvasDoc} from '../canvas/canvas-doc.js'
import {bindExcalidraw} from '../canvas/excalidraw-glue.js'
import {connectRelay} from '../canvas/relay-client.js'
import {createCommentClient} from '../canvas/comment-client.js'
import {Comments} from './comments.js'
import {Controls} from './controls.js'

export type OverlayHandle = {doc: CanvasDoc; dispose: () => void}
export type MountOptions = {
  roomId: string
  base?: string
  session?: string
  onOpen?: (commentId: string) => void
  onClose?: () => void
}

// Mount the transparent, infinite canvas overlay into the host: the Excalidraw React island (the only
// React; its own toolbar/zoom drive drawing) over a transparent background so the app shows through,
// bound to a plain-TS Yjs doc, with a Solid pins/threads layer + a small control bar (Comment / Browse
// / Close). Interactive by default; Browse toggles pass-through so the app beneath is clickable.
// Optionally synced to core's relay. Returns the doc + a dispose.
export function mountCanvasOverlay(host: ShadowRoot | HTMLElement, opts: MountOptions): OverlayHandle {
  const style = document.createElement('style')
  style.textContent = `${excalidrawCss}
.excalidraw, .excalidraw .excalidraw__canvas, .excalidraw .layer-ui__wrapper { background: transparent !important; }`
  host.appendChild(style)

  // z-index:0 makes the surface its own stacking context, so Excalidraw's internal z-indexed elements
  // stay contained below the pins/controls layers (otherwise they paint over our capture div + pins).
  const surface = document.createElement('div')
  surface.style.position = 'absolute'
  surface.style.inset = '0'
  surface.style.zIndex = '0'
  surface.style.background = 'transparent'
  surface.style.pointerEvents = 'auto' // interactive by default — draw immediately with Excalidraw's tools
  host.appendChild(surface)

  const pinsLayer = document.createElement('div')
  pinsLayer.style.position = 'absolute'
  pinsLayer.style.inset = '0'
  pinsLayer.style.zIndex = '10'
  pinsLayer.style.pointerEvents = 'none'
  host.appendChild(pinsLayer)

  const controlsLayer = document.createElement('div')
  controlsLayer.style.position = 'absolute'
  controlsLayer.style.inset = '0'
  controlsLayer.style.zIndex = '20'
  controlsLayer.style.pointerEvents = 'none'
  host.appendChild(controlsLayer)

  const doc = createCanvasDoc(opts.roomId)
  const reactRoot = createRoot(surface)
  reactRoot.render(
    createElement(Excalidraw, {
      initialData: {appState: {viewBackgroundColor: 'transparent'}},
      excalidrawAPI: (instance: unknown) => bindExcalidraw(doc, instance as never),
    }),
  )

  const [commentMode, setCommentMode] = createSignal(false)
  const [passThrough, setPassThrough] = createSignal(false)
  const client = createCommentClient({base: opts.base ?? ''})

  // Browse = pass-through: the app beneath becomes clickable (and comment mode is forced off).
  const onPassThrough = (on: boolean) => {
    setPassThrough(on)
    surface.style.pointerEvents = on ? 'none' : 'auto'
    if (on) onComment(false)
  }
  // Comment mode: the pins layer catches the placement click (see Comments' capture div).
  const onComment = (on: boolean) => {
    setCommentMode(on)
    pinsLayer.style.pointerEvents = on ? 'auto' : 'none'
  }

  const disposeComments = render(
    () => Comments({doc, client, commentMode, onPlaced: () => onComment(false)}),
    pinsLayer,
  )
  const disposeControls = render(
    () =>
      Controls({
        commentMode,
        passThrough,
        onComment,
        onPassThrough,
        onClose: () => opts.onClose?.(),
      }),
    controlsLayer,
  )
  const stopRelay = opts.base && opts.session ? connectRelay(doc, {base: opts.base, session: opts.session}) : () => {}

  return {
    doc,
    dispose: () => {
      stopRelay()
      disposeComments()
      disposeControls()
      reactRoot.unmount()
      doc.dispose()
      style.remove()
      surface.remove()
      pinsLayer.remove()
      controlsLayer.remove()
    },
  }
}
