import {overlayLayer} from './overlay.js'
export {mirrorsKind} from '@conciv/protocol/page-types'

const ACCENT = '#ff40e0'
const CURSOR_MS = 240
const RING_MS = 420
const IDLE_MS = 4000
const FADE_MS = 300

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const CURSOR_SVG =
  `<svg width="34" height="34" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">` +
  `<path d="M2 1.5 L2 17.5 L6.3 13.6 L9.2 20.2 L11.9 19 L9 12.5 L14.6 12.5 Z" ` +
  `fill="${ACCENT}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`

const CURSOR_MARKER = 'data-conciv-cursor'

let cursorEl: HTMLDivElement | undefined
let lastX = -40
let lastY = -40
let idleTimer: ReturnType<typeof setTimeout> | undefined

function fixedLayer(el: HTMLDivElement): void {
  overlayLayer(el)
  el.style.top = '0'
  el.style.left = '0'
}

function ensureCursor(): HTMLDivElement {
  if (cursorEl?.isConnected) return cursorEl
  const adopted = document.querySelector<HTMLDivElement>(`[${CURSOR_MARKER}]`)
  if (adopted) return (cursorEl = adopted)
  const el = document.createElement('div')
  el.setAttribute(CURSOR_MARKER, '')
  fixedLayer(el)
  el.style.width = '34px'
  el.style.height = '34px'
  el.style.marginLeft = '-3px'
  el.style.marginTop = '-2px'
  el.style.filter = `drop-shadow(0 1px 3px rgba(0,0,0,.45)) drop-shadow(0 0 9px ${ACCENT}aa)`
  el.style.transform = `translate(${lastX}px, ${lastY}px)`
  el.innerHTML = CURSOR_SVG
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
  const frames = reduceMotion()
    ? [{opacity: 0}, {opacity: 1, offset: 0.4}, {opacity: 0}]
    : [
        {opacity: 0, transform: 'scale(0.92)'},
        {opacity: 1, transform: 'scale(1)', offset: 0.4},
        {opacity: 0, transform: 'scale(1.04)'},
      ]
  const anim = ring.animate(frames, {duration: RING_MS, easing: EASE_EXPO})
  anim.finished.then(() => ring.remove()).catch(() => ring.remove())
}

function scheduleIdleFade(): void {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const cursor = cursorEl
    if (!cursor?.isConnected) return
    const done = () => {
      cursor.remove()
      if (cursorEl === cursor) cursorEl = undefined
    }
    if (reduceMotion()) return done()
    cursor.animate({opacity: 0}, {duration: FADE_MS, easing: EASE, fill: 'forwards'}).finished.then(done).catch(done)
  }, IDLE_MS)
}

const hasArea = (rect: DOMRect): boolean => rect.width > 0 || rect.height > 0

function moveCursorTo(rect: DOMRect): void {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const cursor = ensureCursor()
  if (reduceMotion()) cursor.style.transform = `translate(${cx}px, ${cy}px)`
  else {
    cursor.animate({transform: `translate(${cx}px, ${cy}px)`}, {duration: CURSOR_MS, easing: EASE, fill: 'none'})
    cursor.style.transform = `translate(${cx}px, ${cy}px)`
  }
  lastX = cx
  lastY = cy
}

export function mirrorPageAction(el: Element): void {
  if (typeof document === 'undefined' || !el.isConnected) return
  const rect = el.getBoundingClientRect()
  if (!hasArea(rect)) return
  moveCursorTo(rect)
  pulseRing(rect)
  scheduleIdleFade()
}
