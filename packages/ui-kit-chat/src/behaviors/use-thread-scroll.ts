import {createEffect, createMemo, createSignal, onMount, type Accessor} from 'solid-js'
import {useChatContext} from '../store/chat-context.js'
import {useThreadAutoScroll} from './use-thread-auto-scroll.js'
import {useTopAnchorReserve, type TopAnchorClamp} from './use-top-anchor-reserve.js'
import {getActiveTopAnchorTurn, parseCssLength} from './top-anchor.js'

export type ThreadScrollOptions = {
  autoScroll?: boolean
  turnAnchor?: 'top' | 'bottom'
  topAnchorMessageClamp?: {tallerThan?: string; visibleHeight?: string}
  scrollToBottomOnRunStart?: boolean
  scrollToBottomOnInitialize?: boolean
  scrollToBottomOnThreadSwitch?: boolean
}

// Resolve a message element by id, scoped to the viewport's own subtree — shadow-DOM safe (an
// element's querySelector searches its descendants in the same tree, never crossing into `document`).
function messageElement(viewport: HTMLElement | undefined, id: string | undefined): HTMLElement | undefined {
  if (!viewport || !id) return undefined
  const found = viewport.querySelector(`[data-message-id="${CSS.escape(id)}"]`)
  return found instanceof HTMLElement ? found : undefined
}

// The one coordinator (API spec §3, ported from assistant-ui). On run-start with turnAnchor='top' it
// pins the run's user turn (anchor) to the top via useTopAnchorReserve (autoscroll OFF); once the
// streaming assistant turn (target) overflows the reserved slack it RELEASES to stick-to-bottom; a
// scroll-up cancels follow; the anchor clears on run-finish. turnAnchor='bottom' is plain
// stick-to-bottom. Also fires the scroll-to-bottom triggers.
export function useThreadScroll(
  viewport: Accessor<HTMLElement | undefined>,
  options: ThreadScrollOptions,
): {isAtBottom: Accessor<boolean>; scrollToBottom: (behavior?: ScrollBehavior) => void} {
  const chat = useChatContext()
  const topAnchored = () => (options.turnAnchor ?? 'bottom') === 'top'
  const isRunning = () => chat.status() === 'streaming' || chat.status() === 'submitted'
  // The active anchor/target message ids for this run (last user → last assistant), or null.
  const activeTurn = createMemo(() =>
    topAnchored() ? getActiveTopAnchorTurn({isRunning: isRunning(), messages: chat.messages()}) : null,
  )

  const [released, setReleased] = createSignal(false)
  // A new run (new active turn) re-arms the top anchor.
  createEffect<string | null>((previous) => {
    const key = activeTurn() ? `${activeTurn()?.anchorId}:${activeTurn()?.targetId}` : null
    if (key !== previous) setReleased(false)
    return key
  }, null)

  const autoScroll = createMemo(() => options.autoScroll ?? (!topAnchored() || activeTurn() === null || released()))
  const hasActiveTopAnchor = () => activeTurn() !== null && !released()
  const scroll = useThreadAutoScroll(viewport, {autoScroll, hasActiveTopAnchor})

  const clamp = createMemo<TopAnchorClamp | null>(() => {
    const element = viewport()
    if (!activeTurn() || !element) return null
    return {
      tallerThan: parseCssLength(options.topAnchorMessageClamp?.tallerThan ?? '10em', element),
      visibleHeight: parseCssLength(options.topAnchorMessageClamp?.visibleHeight ?? '6em', element),
    }
  })

  useTopAnchorReserve({
    viewport,
    anchorEl: () => (released() ? undefined : messageElement(viewport(), activeTurn()?.anchorId)),
    targetEl: () => (released() ? undefined : messageElement(viewport(), activeTurn()?.targetId)),
    clamp,
  })

  // Release to stick-to-bottom once the streaming assistant turn overflows the reserved slack.
  createEffect(() => {
    if (!activeTurn() || released()) return
    const element = viewport()
    const target = messageElement(element, activeTurn()?.targetId)
    const visibleHeight = clamp()?.visibleHeight ?? 0
    if (!element || !target) return
    if (target.getBoundingClientRect().height > element.clientHeight - visibleHeight) setReleased(true)
  })

  // Scroll-to-bottom triggers.
  createEffect<boolean>((wasRunning) => {
    const running = isRunning()
    if (running && !wasRunning && options.scrollToBottomOnRunStart && !topAnchored()) scroll.scrollToBottom('auto')
    return running
  }, false)

  const signature = createMemo(() => chat.messages()[0]?.id ?? '')
  createEffect<string | undefined>((previous) => {
    const current = signature()
    if (options.scrollToBottomOnThreadSwitch && previous !== undefined && previous !== current) {
      scroll.scrollToBottom('auto')
    }
    return current
  }, undefined)

  onMount(() => {
    if (options.scrollToBottomOnInitialize && chat.messages().length > 0) scroll.scrollToBottom('auto')
  })

  return scroll
}
