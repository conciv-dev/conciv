// On-page mirror for page-action verbs: a cursor glide + highlight ring drawn on the real target
// element just before the handler runs. Rendered into the PAGE DOM (document.body), OUTSIDE the
// widget shadow root — like the page driver itself — so it overlays the user's app, not the panel.
// Fire-and-forget and short: it never blocks the action (zero added latency) and self-cleans. The
// future first-party page agent emits the same page-action shape and reuses this unchanged.

// mirrorsKind + the verb set are the single source of truth in @mandarax/protocol, shared with the
// tool-ui card so its "shown on your page" note matches exactly what animates here.
export {mirrorsKind} from '@mandarax/protocol/page-types'

// Brand magenta, kept literal: the overlay lives outside the shadow root, so it can't resolve --pw-*.
const ACCENT = '#ff40e0'
const CURSOR_MS = 240
const RING_MS = 420

const MAX_Z = '2147483647'

let cursorEl: HTMLDivElement | undefined
let lastX = -40
let lastY = -40

function fixedLayer(el: HTMLDivElement): void {
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.zIndex = MAX_Z
  el.style.pointerEvents = 'none'
  el.setAttribute('aria-hidden', 'true')
}

function ensureCursor(): HTMLDivElement {
  if (cursorEl?.isConnected) return cursorEl
  const el = document.createElement('div')
  fixedLayer(el)
  el.style.width = '14px'
  el.style.height = '14px'
  el.style.marginLeft = '-3px'
  el.style.marginTop = '-3px'
  el.style.borderRadius = '50% 50% 50% 2px'
  el.style.background = ACCENT
  el.style.boxShadow = `0 0 10px ${ACCENT}, 0 1px 2px rgba(0,0,0,.5)`
  el.style.transform = `translate(${lastX}px, ${lastY}px)`
  document.body.appendChild(el)
  cursorEl = el
  return el
}

function pulseRing(rect: DOMRect): void {
  const ring = document.createElement('div')
  fixedLayer(ring)
  const pad = 4
  ring.style.left = `${rect.left - pad}px`
  ring.style.top = `${rect.top - pad}px`
  ring.style.width = `${rect.width + pad * 2}px`
  ring.style.height = `${rect.height + pad * 2}px`
  ring.style.border = `2px solid ${ACCENT}`
  ring.style.borderRadius = '8px'
  ring.style.boxShadow = `0 0 0 3px ${ACCENT}33`
  document.body.appendChild(ring)
  const anim = ring.animate(
    [
      {opacity: 0, transform: 'scale(0.92)'},
      {opacity: 1, transform: 'scale(1)', offset: 0.4},
      {opacity: 0, transform: 'scale(1.04)'},
    ],
    {duration: RING_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)'},
  )
  anim.finished.then(() => ring.remove()).catch(() => ring.remove())
}

// Animate a cursor glide to the element's centre, then pulse a ring around it. Fire-and-forget: the
// caller does not await this, so the action fires immediately and a fast click never stalls on it.
export function mirrorPageAction(el: Element): void {
  if (typeof document === 'undefined' || !el.isConnected) return
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const cursor = ensureCursor()
  cursor.animate([{transform: `translate(${lastX}px, ${lastY}px)`}, {transform: `translate(${cx}px, ${cy}px)`}], {
    duration: CURSOR_MS,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'forwards',
  })
  lastX = cx
  lastY = cy
  pulseRing(rect)
}
