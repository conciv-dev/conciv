import {overlayLayer} from './overlay.js'

const TOAST_MS = 2200

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
  setTimeout(() => el.remove(), TOAST_MS)
}
