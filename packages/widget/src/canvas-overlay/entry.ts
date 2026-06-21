import {mountCanvasOverlay, type MountOptions, type OverlayHandle} from './overlay.js'

// The lazy overlay bundle's global. Core serves this file; the widget injects it on the first canvas
// toggle, then calls mount(). Keeping the ~1MB React+Excalidraw island out of the base widget bundle.
declare global {
  interface Window {
    __MANDARAX_CANVAS__?: {mount: (host: ShadowRoot | HTMLElement, opts: MountOptions) => OverlayHandle}
  }
}

window.__MANDARAX_CANVAS__ = {mount: mountCanvasOverlay}
