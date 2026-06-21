import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {createSignal} from 'solid-js'
import {render} from 'solid-js/web'
import {Excalidraw} from '@excalidraw/excalidraw'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import {createCanvasDoc, type CanvasDoc} from '../canvas/canvas-doc.js'
import {bindExcalidraw} from '../canvas/excalidraw-glue.js'
import {connectRelay} from '../canvas/relay-client.js'
import {Pins} from './pins.js'
import {Controls, type ExcalidrawApi} from './controls.js'

export type OverlayHandle = {doc: CanvasDoc; dispose: () => void}
export type MountOptions = {roomId: string; base?: string; session?: string; onOpen?: (commentId: string) => void}

// Mount the transparent, infinite canvas overlay into a shadow root: the Excalidraw React island (the
// only React, zen-mode so its chrome is hidden, transparent background so the app shows through) bound
// to a plain-TS Yjs doc, a Solid pins layer + our own zoom/draw controls over it, optionally synced to
// core's relay. The overlay is pass-through by default (idle: pointer-events none, so the app beneath
// stays usable); the Draw toggle flips the canvas interactive. Returns the doc + a dispose.
export function mountCanvasOverlay(host: ShadowRoot | HTMLElement, opts: MountOptions): OverlayHandle {
  const style = document.createElement('style')
  style.textContent = `${excalidrawCss}
.excalidraw, .excalidraw .excalidraw__canvas, .excalidraw .layer-ui__wrapper { background: transparent !important; }`
  host.appendChild(style)

  const surface = document.createElement('div')
  surface.style.position = 'absolute'
  surface.style.inset = '0'
  surface.style.background = 'transparent'
  surface.style.pointerEvents = 'none' // idle: the app beneath stays clickable until Draw is on
  host.appendChild(surface)

  const pinsLayer = document.createElement('div')
  pinsLayer.style.position = 'absolute'
  pinsLayer.style.inset = '0'
  pinsLayer.style.pointerEvents = 'none'
  host.appendChild(pinsLayer)

  const controlsLayer = document.createElement('div')
  controlsLayer.style.position = 'absolute'
  controlsLayer.style.inset = '0'
  controlsLayer.style.pointerEvents = 'none'
  host.appendChild(controlsLayer)

  const doc = createCanvasDoc(opts.roomId)
  const [api, setApi] = createSignal<ExcalidrawApi | null>(null)

  const reactRoot = createRoot(surface)
  reactRoot.render(
    createElement(Excalidraw, {
      initialData: {appState: {viewBackgroundColor: 'transparent', zenModeEnabled: true}},
      excalidrawAPI: (instance: unknown) => {
        setApi(instance as ExcalidrawApi)
        bindExcalidraw(doc, instance as never)
      },
    }),
  )

  const disposePins = render(() => Pins({doc, onOpen: opts.onOpen ?? (() => {})}), pinsLayer)
  const disposeControls = render(
    () => Controls({api, onDrawChange: (draw) => (surface.style.pointerEvents = draw ? 'auto' : 'none')}),
    controlsLayer,
  )
  const stopRelay = opts.base && opts.session ? connectRelay(doc, {base: opts.base, session: opts.session}) : () => {}

  return {
    doc,
    dispose: () => {
      stopRelay()
      disposePins()
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
