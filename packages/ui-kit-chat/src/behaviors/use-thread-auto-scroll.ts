import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'

// Stick-to-bottom autoscroll, ported from chat-panel.tsx:521-541 + assistant-ui's 1px tolerance and
// pending-intent decoupling. Follows streaming content only while the user is already at the bottom;
// a scroll-up / pointerdown cancels the pending intent. The streaming mutation flood is coalesced
// into one scroll write per frame (reading scrollHeight per token would force a layout per delta).
const TOLERANCE = 1

export function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {autoScroll: Accessor<boolean>},
): {isAtBottom: Accessor<boolean>; scrollToBottom: (behavior?: ScrollBehavior) => void} {
  const [isAtBottom, setIsAtBottom] = createSignal(true)
  const intent = {pending: false}
  const atBottom = (element: HTMLElement) =>
    element.scrollHeight - element.scrollTop - element.clientHeight <= TOLERANCE

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const element = viewport()
    if (!element) return
    intent.pending = true
    setIsAtBottom(true)
    if (behavior === 'auto') {
      element.scrollTop = element.scrollHeight
      return
    }
    element.scrollTo({top: element.scrollHeight, behavior})
  }

  createEffect(() => {
    const element = viewport()
    if (!element) return
    const onScroll = () => {
      const bottom = atBottom(element)
      setIsAtBottom(bottom)
      if (!bottom) intent.pending = false
    }
    const cancelIntent = () => {
      intent.pending = false
    }
    onScroll()
    element.addEventListener('scroll', onScroll, {passive: true})
    element.addEventListener('pointerdown', cancelIntent, {passive: true})
    element.addEventListener('wheel', cancelIntent, {passive: true})
    onCleanup(() => {
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('pointerdown', cancelIntent)
      element.removeEventListener('wheel', cancelIntent)
    })
  })

  createEffect(() => {
    const element = viewport()
    if (!element || !opts.autoScroll()) return
    const scheduled = {value: false}
    const follow = () => {
      if (!(isAtBottom() || intent.pending) || scheduled.value) return
      scheduled.value = true
      requestAnimationFrame(() => {
        scheduled.value = false
        element.scrollTop = element.scrollHeight
      })
    }
    const observer = new MutationObserver(follow)
    observer.observe(element, {childList: true, subtree: true, characterData: true})
    onCleanup(() => observer.disconnect())
  })

  return {isAtBottom, scrollToBottom}
}
