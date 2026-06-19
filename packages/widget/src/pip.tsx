import {createSignal, onCleanup} from 'solid-js'
import {delegateEvents} from 'solid-js/web'
import styles from './styles.css?inline'
import {registerWind4Properties} from './shadow.js'

// Picture-in-Picture: pop a live DOM node into a separate OS window and re-dock it on close.
// Adapted from TanStack Devtools' pip-context (MIT). Devtools copies document.styleSheets because
// its styles live in the page; ours live in the widget's shadow root, so we instead give the PiP
// window its own shadow root seeded with the same style text and MOVE the node into it — the live
// node (and its chat state) travels intact. A placeholder marks the home spot for re-docking.
const DELEGATED = [
  'focusin',
  'focusout',
  'pointermove',
  'keydown',
  'pointerdown',
  'pointerup',
  'click',
  'mousedown',
  'input',
]

// Fills the window and `!`-flattens its one popped child (qt or panel) back to a plain fill — important beats the child's utilities + inline height.
const PIP_WRAP =
  'fixed inset-0 flex [&>*]:!static [&>*]:!inset-auto [&>*]:!w-full [&>*]:!h-full [&>*]:!max-h-none [&>*]:!transform-none [&>*]:!opacity-100 [&>*]:!visible [&>*]:!pointer-events-auto [&>*]:!border-none [&>*]:!rounded-none [&>*]:!shadow-none [&_[role=separator]]:hidden'

export function createPiP(): {
  active: () => boolean
  open: (node: HTMLElement, opts?: {title?: string; width?: number; height?: number}) => void
  close: () => void
} {
  const [win, setWin] = createSignal<Window | null>(null)
  let placeholder: Comment | null = null
  let moved: HTMLElement | null = null

  const redock = () => {
    if (moved && placeholder?.parentNode) placeholder.parentNode.replaceChild(moved, placeholder)
    moved = null
    placeholder = null
  }

  const close = () => {
    const w = win()
    redock()
    if (w) w.close()
    setWin(null)
  }

  const open = (node: HTMLElement, opts: {title?: string; width?: number; height?: number} = {}) => {
    if (win()) return
    const w = window.open('', 'mandarax-pip', `width=${opts.width ?? 480},height=${opts.height ?? 620},popup`)
    if (!w) return
    w.document.head.innerHTML = ''
    w.document.body.innerHTML = ''
    w.document.title = opts.title ?? 'mandarax'
    w.document.body.style.margin = '0'
    // wind4's @property rules must register in the PiP document too (they don't register from the
    // shadow <style> below), else translate/opacity utilities collapse in the popped-out window.
    registerWind4Properties(w.document)

    // A shadow root in the PiP doc, seeded with our styles. The host carries a data-pw-pip-host hook
    // (no styling — just the shadow-walk anchor); the wrap fills the window and flattens the popped
    // child's docked chrome (fixed position, drop animation, resize height, floating-card shell).
    const host = w.document.createElement('div')
    host.setAttribute('data-pw-pip-host', '')
    w.document.body.appendChild(host)
    const root = host.attachShadow({mode: 'open'})
    const style = w.document.createElement('style')
    style.textContent = styles
    root.appendChild(style)
    const wrap = w.document.createElement('div')
    wrap.className = PIP_WRAP
    root.appendChild(wrap)

    // Drop a placeholder where the node lived, then move it into the PiP shadow (appendChild across
    // documents auto-adopts the node — its Solid reactivity keeps working).
    placeholder = node.ownerDocument.createComment('mandarax-pip')
    node.parentNode?.replaceChild(placeholder, node)
    wrap.appendChild(node)
    moved = node

    // Solid delegates events on the document where they fire; register on the PiP document too.
    delegateEvents(DELEGATED, w.document)
    w.addEventListener('pagehide', close)
    window.addEventListener('beforeunload', close)
    setWin(w)
  }

  onCleanup(() => {
    if (win()) close()
  })

  return {active: () => win() !== null, open, close}
}
