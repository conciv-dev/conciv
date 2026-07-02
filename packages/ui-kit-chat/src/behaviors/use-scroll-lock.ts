import {type Accessor} from 'solid-js'

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
