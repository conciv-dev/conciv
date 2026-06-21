import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {render} from 'solid-js/web'
import {Excalidraw} from '@excalidraw/excalidraw'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import {createCanvasDoc, type CanvasDoc} from '../canvas/canvas-doc.js'
import {bindExcalidraw} from '../canvas/excalidraw-glue.js'
import {connectRelay} from '../canvas/relay-client.js'
import {Pins} from './pins.js'

export type OverlayHandle = {doc: CanvasDoc; dispose: () => void}

export type MountOptions = {roomId: string; base?: string; session?: string; onOpen?: (commentId: string) => void}

// Mount the canvas overlay into a shadow root: the Excalidraw React island (the only React) bound to a
// plain-TS Yjs doc, with a Solid pins layer over it, optionally synced to core's relay. Returns the doc
// (test hook) + a dispose. This bundle is built separately and injected on toggle (lazy), never in the
// base widget bundle.
export function mountCanvasOverlay(host: ShadowRoot | HTMLElement, opts: MountOptions): OverlayHandle {
  const style = document.createElement('style')
  style.textContent = excalidrawCss
  host.appendChild(style)

  const surface = document.createElement('div')
  surface.style.position = 'absolute'
  surface.style.inset = '0'
  host.appendChild(surface)

  const pinsLayer = document.createElement('div')
  pinsLayer.style.position = 'absolute'
  pinsLayer.style.inset = '0'
  pinsLayer.style.pointerEvents = 'none'
  host.appendChild(pinsLayer)

  const doc = createCanvasDoc(opts.roomId)
  const reactRoot = createRoot(surface)
  reactRoot.render(createElement(Excalidraw, {excalidrawAPI: (api: unknown) => bindExcalidraw(doc, api as never)}))

  const disposePins = render(() => Pins({doc, onOpen: opts.onOpen ?? (() => {})}), pinsLayer)
  const stopRelay = opts.base && opts.session ? connectRelay(doc, {base: opts.base, session: opts.session}) : () => {}

  return {
    doc,
    dispose: () => {
      stopRelay()
      disposePins()
      reactRoot.unmount()
      doc.dispose()
      style.remove()
      surface.remove()
      pinsLayer.remove()
    },
  }
}
