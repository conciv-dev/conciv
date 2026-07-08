import {createEffect, createMemo, createSignal, onMount, type Accessor} from 'solid-js'
import {useChatContext} from '../store/chat-context.js'
import {useThreadAutoScroll, type ThreadAutoScroll} from './use-thread-auto-scroll.js'
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

function messageElement(viewport: HTMLElement | undefined, id: string | undefined): HTMLElement | undefined {
  if (!viewport || !id) return undefined
  const found = viewport.querySelector(`[data-message-id="${CSS.escape(id)}"]`)
  return found instanceof HTMLElement ? found : undefined
}

export function useThreadScroll(
  viewport: Accessor<HTMLElement | undefined>,
  options: ThreadScrollOptions,
): ThreadAutoScroll {
  const chat = useChatContext()
  const topAnchored = () => (options.turnAnchor ?? 'bottom') === 'top'
  const isRunning = () => chat.status() === 'streaming' || chat.status() === 'submitted'

  const activeTurn = createMemo(() =>
    topAnchored() ? getActiveTopAnchorTurn({isRunning: isRunning(), messages: chat.messages()}) : null,
  )

  const [released, setReleased] = createSignal(false)

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

  createEffect(() => {
    if (!activeTurn() || released()) return
    const element = viewport()
    const target = messageElement(element, activeTurn()?.targetId)
    const visibleHeight = clamp()?.visibleHeight ?? 0
    if (!element || !target) return
    if (target.getBoundingClientRect().height > element.clientHeight - visibleHeight) setReleased(true)
  })

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
