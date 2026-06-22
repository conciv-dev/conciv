import {createEffect, createRoot, createSignal} from 'solid-js'
import type {IslandHandle} from './island-types.js'

type ZoomControlsOpts = {handle: IslandHandle; reducedMotion: () => boolean}

const BUTTONS = [
  {label: 'Zoom out', glyph: '−', act: (h: IslandHandle) => h.setZoomClamped(h.getZoom() / 1.2)},
  {label: 'Reset zoom', glyph: '100%', act: (h: IslandHandle) => h.setZoomClamped(1)},
  {label: 'Zoom in', glyph: '+', act: (h: IslandHandle) => h.setZoomClamped(h.getZoom() * 1.2)},
  {label: 'Zoom to fit', glyph: '⛶', act: (h: IslandHandle) => h.fitToContent()},
]

export function mountZoomControls(opts: ZoomControlsOpts): {el: HTMLElement; dispose: () => void} {
  return createRoot((dispose) => {
    const [zoom, setZoom] = createSignal(opts.handle.getZoom())
    const el = document.createElement('div')
    el.setAttribute('data-whiteboard-zoom', '')
    el.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2;display:flex;gap:4px;align-items:center;pointer-events:auto'

    const readout = document.createElement('output')
    readout.setAttribute('role', 'status')
    createEffect(() => void (readout.textContent = `${Math.round(zoom() * 100)}%`))

    const refresh = (): void => {
      setZoom(opts.handle.getZoom())
      setTimeout(() => setZoom(opts.handle.getZoom()), 120)
    }

    const press = (button: HTMLButtonElement): void => {
      if (opts.reducedMotion()) return
      button.animate([{transform: 'scale(0.92)'}, {transform: 'scale(1)'}], {duration: 120})
    }

    const buttons = BUTTONS.map((spec) => {
      const button = document.createElement('button')
      button.setAttribute('aria-label', spec.label)
      button.textContent = spec.glyph
      button.style.cssText = 'pointer-events:auto'
      button.addEventListener('click', () => {
        press(button)
        spec.act(opts.handle)
        refresh()
      })
      return button
    })

    el.append(...buttons, readout)
    return {el, dispose}
  })
}
