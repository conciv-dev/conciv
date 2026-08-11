import {createEffect, onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile, unwrap} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {makeTimer} from '@solid-primitives/timer'
import {
  followPlanFor,
  followTransition,
  followingThread,
  type ThreadFollowEvent,
  type ThreadFollowPlan,
  type ThreadFollowState,
  type ThreadMeasurement,
} from './thread-follow-machine.js'

export const POSITION_HOLD_MS = 350
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])
const LAYOUT_ATTRIBUTES = ['class', 'hidden', 'data-state', 'data-empty']

export type ThreadAutoScroll = {
  isAtBottom: Accessor<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
  holdPosition: (durationMs?: number) => void
}

function measure(div: HTMLElement): ThreadMeasurement {
  return {scrollTop: div.scrollTop, scrollHeight: div.scrollHeight, clientHeight: div.clientHeight}
}

export function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {autoScroll: Accessor<boolean>; hasActiveTopAnchor?: Accessor<boolean>},
): ThreadAutoScroll {
  const [state, setState] = createStore<ThreadFollowState>(followingThread())

  const send = (event: ThreadFollowEvent): ThreadFollowPlan => {
    const before = unwrap(state)
    const after = followTransition(before, event)
    const plan = followPlanFor(before, after, event)
    if (after !== before) setState(reconcile(after))
    const div = viewport()
    if (!div) return plan
    if (plan.restore !== null) div.scrollTop = plan.restore
    if (plan.pin !== null) div.scrollTo({top: div.scrollHeight, behavior: plan.pin})
    return plan
  }

  const onScroll = () => {
    const div = viewport()
    if (!div) return
    send({type: 'scrolled', at: measure(div)})
  }

  const onResize = () => {
    const div = viewport()
    if (!div) return
    const plan = send({
      type: 'resized',
      at: measure(div),
      autoScroll: opts.autoScroll(),
      topAnchored: opts.hasActiveTopAnchor?.() ?? false,
    })
    if (plan.rescan) onScroll()
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    send({type: 'requestBottom', behavior})
  }

  const holdPosition = (durationMs: number = POSITION_HOLD_MS) => {
    const div = viewport()
    if (!div) return
    send({type: 'hold', at: measure(div), startedAt: performance.now(), durationMs})
  }

  createEffect(() => {
    const hold = state.hold
    if (!hold) return
    const startedAt = hold.startedAt
    makeTimer(() => send({type: 'release', startedAt}), hold.durationMs, setTimeout)
  })

  createEffect(() => {
    const div = viewport()
    if (!div) return
    const passive = {passive: true}
    makeEventListener(div, 'scroll', onScroll)
    makeEventListener(div, 'pointerdown', () => send({type: 'pointerDown'}))
    makeEventListener(
      div,
      'pointermove',
      (event) => {
        if (event.buttons > 0) send({type: 'pointerMove'})
      },
      passive,
    )
    const endPointerDrag = () => send({type: 'pointerUp', at: measure(div)})
    makeEventListener(div, 'pointerup', endPointerDrag, passive)
    makeEventListener(div, 'pointercancel', endPointerDrag, passive)
    makeEventListener(
      div,
      'wheel',
      (event) => {
        if (event.deltaY < 0) send({type: 'wheelUp'})
      },
      passive,
    )
    const endTouch = () => send({type: 'touchEnd', at: measure(div)})
    makeEventListener(div, 'touchmove', () => send({type: 'touchMove'}), passive)
    makeEventListener(div, 'touchend', endTouch, passive)
    makeEventListener(div, 'touchcancel', endTouch, passive)
    makeEventListener(div, 'keydown', (event) => {
      if (SCROLL_KEYS.has(event.key)) send({type: 'scrollKeyDown'})
    })
    makeEventListener(div, 'keyup', (event) => {
      if (SCROLL_KEYS.has(event.key)) send({type: 'scrollKeySettled', at: measure(div)})
    })
    const resizeObserver = new ResizeObserver(onResize)
    const mutationObserver = new MutationObserver(onResize)
    resizeObserver.observe(div)
    mutationObserver.observe(div, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: LAYOUT_ATTRIBUTES,
    })
    onScroll()
    onCleanup(() => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    })
  })

  return {isAtBottom: () => state.atBottom, scrollToBottom, holdPosition}
}
