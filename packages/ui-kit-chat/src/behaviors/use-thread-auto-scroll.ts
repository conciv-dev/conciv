import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'

export const POSITION_HOLD_MS = 350
const SCROLL_HOLD_ATTR = 'data-scroll-hold'

export type ThreadAutoScroll = {
  isAtBottom: Accessor<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
  holdPosition: (durationMs?: number) => void
}

export function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {autoScroll: Accessor<boolean>; hasActiveTopAnchor?: Accessor<boolean>},
): ThreadAutoScroll {
  const [isAtBottom, setIsAtBottom] = createSignal(true)
  const intent = {behavior: null as ScrollBehavior | null}
  const last = {scrollTop: 0, scrollHeight: 0, observedScrollHeight: 0, observedClientHeight: 0}
  const holding = () => viewport()?.hasAttribute(SCROLL_HOLD_ATTR) ?? false

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const div = viewport()
    if (!div) return
    intent.behavior = behavior
    div.scrollTo({top: div.scrollHeight, behavior})
  }

  let releaseHold: (() => void) | undefined
  onCleanup(() => releaseHold?.())
  const holdPosition = (durationMs: number = POSITION_HOLD_MS) => {
    const div = viewport()
    if (!div) return
    releaseHold?.()
    intent.behavior = null
    const top = div.scrollTop
    div.setAttribute(SCROLL_HOLD_ATTR, '')
    const pin = () => {
      div.scrollTop = top
    }
    div.addEventListener('scroll', pin)
    const timer = setTimeout(() => releaseHold?.(), durationMs)
    releaseHold = () => {
      clearTimeout(timer)
      div.removeEventListener('scroll', pin)
      div.removeAttribute(SCROLL_HOLD_ATTR)
      releaseHold = undefined
    }
  }

  const recomputeIsAtBottom = () => {
    const div = viewport()
    if (!div) return
    const wasAtBottom = isAtBottom()
    const newIsAtBottom =
      Math.abs(div.scrollHeight - div.scrollTop - div.clientHeight) <= 1 || div.scrollHeight <= div.clientHeight
    if (newIsAtBottom !== wasAtBottom) setIsAtBottom(newIsAtBottom)
    last.scrollTop = div.scrollTop
    last.scrollHeight = div.scrollHeight
  }

  const handleScroll = () => {
    const div = viewport()
    if (!div) return
    if (holding()) {
      recomputeIsAtBottom()
      return
    }
    const wasAtBottom = isAtBottom()
    const newIsAtBottom =
      Math.abs(div.scrollHeight - div.scrollTop - div.clientHeight) <= 1 || div.scrollHeight <= div.clientHeight
    const isInFlightDownwardScroll = !newIsAtBottom && last.scrollTop < div.scrollTop
    if (!isInFlightDownwardScroll) {
      if (newIsAtBottom) {
        if (div.scrollHeight > div.clientHeight + 1) intent.behavior = null
      } else if (last.scrollTop > div.scrollTop && last.scrollHeight === div.scrollHeight) {
        intent.behavior = null
      }
      const shouldUpdate = newIsAtBottom || intent.behavior === null
      if (shouldUpdate && newIsAtBottom !== wasAtBottom) setIsAtBottom(newIsAtBottom)
    }
    last.scrollTop = div.scrollTop
    last.scrollHeight = div.scrollHeight
  }

  const handleResize = () => {
    const div = viewport()
    if (!div) return
    const {scrollHeight, clientHeight} = div
    if (scrollHeight === last.observedScrollHeight && clientHeight === last.observedClientHeight) return
    last.observedScrollHeight = scrollHeight
    last.observedClientHeight = clientHeight
    if (holding()) {
      recomputeIsAtBottom()
      return
    }
    const behavior = intent.behavior
    if (behavior && opts.hasActiveTopAnchor?.()) {
      intent.behavior = null
    } else if (behavior) {
      scrollToBottom(behavior)
    } else if (opts.autoScroll() && isAtBottom()) {
      scrollToBottom('instant')
    }
    handleScroll()
  }

  createEffect(() => {
    const div = viewport()
    if (!div) return

    const cancelIntent = () => {
      intent.behavior = null
    }
    div.addEventListener('scroll', handleScroll)
    div.addEventListener('pointerdown', cancelIntent)
    const resizeObserver = new ResizeObserver(handleResize)
    const mutationObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type !== 'attributes' || mutation.attributeName !== 'style')) {
        handleResize()
      }
    })
    resizeObserver.observe(div)
    mutationObserver.observe(div, {childList: true, subtree: true, attributes: true, characterData: true})
    handleScroll()
    onCleanup(() => {
      div.removeEventListener('scroll', handleScroll)
      div.removeEventListener('pointerdown', cancelIntent)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    })
  })

  return {isAtBottom, scrollToBottom, holdPosition}
}
