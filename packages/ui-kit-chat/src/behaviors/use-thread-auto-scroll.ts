import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'

export const POSITION_HOLD_MS = 350
const SCROLL_HOLD_ATTR = 'data-scroll-hold'
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])

function isAtBottomNow(div: HTMLElement): boolean {
  const withinTolerance = Math.abs(div.scrollHeight - div.scrollTop - div.clientHeight) <= 1
  return withinTolerance || div.scrollHeight <= div.clientHeight
}

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
  const gesture = {userDetached: false, touching: false}
  const holding = () => viewport()?.hasAttribute(SCROLL_HOLD_ATTR) ?? false

  const pinToBottom = (behavior: ScrollBehavior) => {
    const div = viewport()
    if (!div) return
    intent.behavior = behavior
    div.scrollTo({top: div.scrollHeight, behavior})
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    gesture.userDetached = false
    pinToBottom(behavior)
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

  const rememberPosition = (div: HTMLElement) => {
    last.scrollTop = div.scrollTop
    last.scrollHeight = div.scrollHeight
  }

  const publishAtBottom = (nowAtBottom: boolean) => {
    if (nowAtBottom) gesture.userDetached = false
    if (nowAtBottom === isAtBottom()) return
    setIsAtBottom(nowAtBottom)
  }

  const recomputeIsAtBottom = () => {
    const div = viewport()
    if (!div) return
    publishAtBottom(isAtBottomNow(div))
    rememberPosition(div)
  }

  const isMomentumScroll = (div: HTMLElement, nowAtBottom: boolean) =>
    !gesture.touching && !nowAtBottom && last.scrollTop < div.scrollTop

  const isDraggedUpward = (div: HTMLElement) => last.scrollTop > div.scrollTop && last.scrollHeight === div.scrollHeight

  const clearIntentForScroll = (div: HTMLElement, nowAtBottom: boolean) => {
    if (nowAtBottom) {
      if (div.scrollHeight > div.clientHeight + 1) intent.behavior = null
      return
    }
    if (isDraggedUpward(div)) intent.behavior = null
  }

  const settleAtBottom = (nowAtBottom: boolean) => {
    if (!nowAtBottom && intent.behavior !== null) return
    publishAtBottom(nowAtBottom)
  }

  const applyScroll = (div: HTMLElement) => {
    const nowAtBottom = isAtBottomNow(div)
    if (!isMomentumScroll(div, nowAtBottom)) {
      clearIntentForScroll(div, nowAtBottom)
      settleAtBottom(nowAtBottom)
    }
    rememberPosition(div)
  }

  const handleScroll = () => {
    const div = viewport()
    if (!div) return
    if (holding()) {
      recomputeIsAtBottom()
      return
    }
    applyScroll(div)
  }

  const hasStreamingFollow = () => opts.autoScroll() && isAtBottom() && !gesture.userDetached

  const releasesTopAnchor = (behavior: ScrollBehavior | null) =>
    behavior !== null && (opts.hasActiveTopAnchor?.() ?? false)

  const applyResize = () => {
    const behavior = intent.behavior
    if (releasesTopAnchor(behavior)) {
      intent.behavior = null
      return
    }
    if (behavior) {
      pinToBottom(behavior)
      return
    }
    if (hasStreamingFollow()) pinToBottom('instant')
  }

  const hasNewDimensions = (div: HTMLElement) =>
    div.scrollHeight !== last.observedScrollHeight || div.clientHeight !== last.observedClientHeight

  const handleResize = () => {
    const div = viewport()
    if (!div) return
    if (!hasNewDimensions(div)) return
    last.observedScrollHeight = div.scrollHeight
    last.observedClientHeight = div.clientHeight
    if (holding()) {
      recomputeIsAtBottom()
      return
    }
    applyResize()
    handleScroll()
  }

  createEffect(() => {
    const div = viewport()
    if (!div) return

    const cancelIntent = () => {
      intent.behavior = null
    }
    const detach = () => {
      intent.behavior = null
      gesture.userDetached = true
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) detach()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) detach()
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) recomputeIsAtBottom()
    }
    const handleTouchStart = () => {
      gesture.touching = true
    }
    const handleTouchEnd = () => {
      gesture.touching = false
      recomputeIsAtBottom()
    }
    const passive = {passive: true}
    div.addEventListener('scroll', handleScroll)
    div.addEventListener('pointerdown', cancelIntent)
    div.addEventListener('wheel', handleWheel, passive)
    div.addEventListener('touchstart', handleTouchStart, passive)
    div.addEventListener('touchmove', detach, passive)
    div.addEventListener('touchend', handleTouchEnd, passive)
    div.addEventListener('touchcancel', handleTouchEnd, passive)
    div.addEventListener('keydown', handleKeyDown)
    div.addEventListener('keyup', handleKeyUp)
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
      div.removeEventListener('wheel', handleWheel)
      div.removeEventListener('touchstart', handleTouchStart)
      div.removeEventListener('touchmove', detach)
      div.removeEventListener('touchend', handleTouchEnd)
      div.removeEventListener('touchcancel', handleTouchEnd)
      div.removeEventListener('keydown', handleKeyDown)
      div.removeEventListener('keyup', handleKeyUp)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    })
  })

  return {isAtBottom, scrollToBottom, holdPosition}
}
