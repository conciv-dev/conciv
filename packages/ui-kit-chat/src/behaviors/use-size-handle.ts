import {createEffect, onCleanup, type Accessor} from 'solid-js'

export function useSizeHandle(
  el: Accessor<HTMLElement | undefined>,
  onResize: (size: {width: number; height: number}) => void,
): void {
  createEffect(() => {
    const element = el()
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) onResize({width: entry.contentRect.width, height: entry.contentRect.height})
    })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  })
}
