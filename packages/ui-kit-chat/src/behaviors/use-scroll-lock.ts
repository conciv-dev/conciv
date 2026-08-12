import {createRoot, getOwner, type Accessor} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {makeTimer} from '@solid-primitives/timer'

const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll'])

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element
  while (current) {
    if (SCROLLABLE_OVERFLOW.has(getComputedStyle(current).overflowY)) return current
    current = current.parentElement
  }
  return null
}

export function useScrollLock(animatedElement: Accessor<HTMLElement | undefined>, animationDuration: number) {
  const owner = getOwner()
  let cleanup: (() => void) | null = null

  return () => {
    cleanup?.()
    cleanup = null

    const element = animatedElement()
    if (!element) return
    const scrollContainer = findScrollableAncestor(element)
    if (!scrollContainer) return

    const scrollPosition = scrollContainer.scrollTop
    const previousScrollbarWidth = scrollContainer.style.scrollbarWidth
    const computed = getComputedStyle(scrollContainer)
    const paddingProperty = computed.direction === 'rtl' ? 'paddingLeft' : 'paddingRight'
    const previousPadding = scrollContainer.style[paddingProperty]
    const scrollbarSize =
      scrollContainer.offsetWidth -
      scrollContainer.clientWidth -
      Number.parseFloat(computed.borderLeftWidth) -
      Number.parseFloat(computed.borderRightWidth)

    scrollContainer.style.scrollbarWidth = 'none'
    if (scrollbarSize > 0) {
      scrollContainer.style[paddingProperty] = `${Number.parseFloat(computed[paddingProperty]) + scrollbarSize}px`
    }

    const restoreStyles = () => {
      scrollContainer.style.scrollbarWidth = previousScrollbarWidth
      scrollContainer.style[paddingProperty] = previousPadding
    }

    const resetPosition = () => {
      if (scrollContainer.scrollTop > scrollPosition) scrollContainer.scrollTop = scrollPosition
    }

    createRoot((dispose) => {
      const clearScrollListener = makeEventListener(scrollContainer, 'scroll', resetPosition)
      const clearTimer = makeTimer(
        () => {
          clearScrollListener()
          restoreStyles()
          cleanup = null
          dispose()
        },
        animationDuration,
        setTimeout,
      )

      cleanup = () => {
        clearTimer()
        clearScrollListener()
        restoreStyles()
        dispose()
      }
    }, owner ?? undefined)
  }
}
