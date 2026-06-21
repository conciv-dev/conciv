import type {Component} from 'solid-js'
import type {MountOptions, OverlayHandle} from './canvas-overlay/overlay.js'

// Lazy loader for the core-served overlay bundle: inject the <script> once, then use its global.
declare global {
  interface Window {
    __MANDARAX_CANVAS__?: {mount: (host: ShadowRoot | HTMLElement, opts: MountOptions) => OverlayHandle}
  }
}

function loadOverlay(apiBase: string): Promise<NonNullable<Window['__MANDARAX_CANVAS__']>> {
  if (window.__MANDARAX_CANVAS__) return Promise.resolve(window.__MANDARAX_CANVAS__)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${apiBase}/api/canvas/overlay.js`
    script.onload = () =>
      window.__MANDARAX_CANVAS__
        ? resolve(window.__MANDARAX_CANVAS__)
        : reject(new Error('overlay global missing after load'))
    script.onerror = () => reject(new Error('overlay bundle failed to load'))
    document.head.appendChild(script)
  })
}

const CanvasIcon: Component<{class?: string}> = (props) => (
  <svg
    class={props.class}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
)

export type CanvasToggleAction = {
  id: string
  label: string
  icon: Component<{class?: string}>
  onClick: () => Promise<void>
}

// A composer action that toggles the lazy canvas overlay on/off, mounted into the widget shadow root.
export function makeCanvasToggle(root: ShadowRoot, apiBase: string, session: string): CanvasToggleAction {
  let handle: OverlayHandle | null = null
  let host: HTMLDivElement | null = null
  return {
    id: 'canvas',
    label: 'Canvas',
    icon: CanvasIcon,
    onClick: async () => {
      if (handle) {
        handle.dispose()
        handle = null
        host?.remove()
        host = null
        return
      }
      const api = await loadOverlay(apiBase)
      host = document.createElement('div')
      host.style.position = 'absolute'
      host.style.inset = '0'
      host.style.pointerEvents = 'auto'
      root.appendChild(host)
      handle = api.mount(host, {roomId: session, base: apiBase, session})
    },
  }
}
