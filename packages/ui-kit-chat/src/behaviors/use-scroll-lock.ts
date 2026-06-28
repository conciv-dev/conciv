import {type Accessor} from 'solid-js'

// Lock a viewport's scroll position over a collapse/expand animation so the surrounding content does
// not jump (D13). Returns a trigger to call right before the animation starts; it pins scrollTop for
// the animation's duration. Ported from assistant-ui's reasoning/useScrollLock.
export function useScrollLock<T extends HTMLElement>(
  el: Accessor<T | undefined>,
  animationDurationMs: number,
): () => void {
  return () => {
    const element = el()
    if (!element) return
    const scroller = element.closest('[data-thread-viewport]')
    const target = scroller instanceof HTMLElement ? scroller : element
    const top = target.scrollTop
    const pin = () => {
      target.scrollTop = top
    }
    const id = setInterval(pin, 16)
    setTimeout(() => clearInterval(id), animationDurationMs)
  }
}
