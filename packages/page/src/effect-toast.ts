import {overlayLayer} from './overlay.js'

const TOAST_MS = 2200
const EXIT_MS = 200
const ENTER_MS = 180

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const TONES: Record<'info' | 'success' | 'error', string> = {
  info: '#26262b',
  success: '#0a7d3f',
  error: '#b00020',
}

export function showToast(msg: string, tone: 'info' | 'success' | 'error' = 'info'): void {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.textContent = msg
  overlayLayer(el)
  Object.assign(el.style, {
    bottom: '18px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: TONES[tone],
    color: '#fff',
    font: '12px system-ui, sans-serif',
    padding: '6px 12px',
    borderRadius: '7px',
    boxShadow: '0 2px 10px rgba(0,0,0,.45)',
  })
  document.body.appendChild(el)
  const enter = reduceMotion()
    ? [{opacity: 0}, {opacity: 1}]
    : [
        {opacity: 0, transform: 'translateX(-50%) translateY(6px)'},
        {opacity: 1, transform: 'translateX(-50%) translateY(0)'},
      ]
  el.animate(enter, {duration: ENTER_MS, easing: EASE_EXPO, fill: 'none'})
  setTimeout(() => {
    el.animate({opacity: 0}, {duration: EXIT_MS, easing: EASE, fill: 'forwards'})
      .finished.then(() => el.remove())
      .catch(() => el.remove())
  }, TOAST_MS - EXIT_MS)
}
