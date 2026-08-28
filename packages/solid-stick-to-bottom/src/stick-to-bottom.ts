import {createEffect, createSignal, untrack, type Accessor} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import {createMutationObserver} from '@solid-primitives/mutation-observer'

const END_THRESHOLD_PX = 32
const LANDED_TOLERANCE_PX = 1
const SCROLLABLE_OVERFLOW = ['auto', 'scroll']
const RELEASING_KEYS = ['ArrowUp', 'PageUp', 'Home']

export type FollowPhase = 'following' | 'settling' | 'released'

export type FollowContent = {
  totalSize: Accessor<number>
  measured: Accessor<boolean>
}

export type StickToBottomOptions = {
  follow?: Accessor<boolean>
  content?: Accessor<FollowContent | undefined>
}

export type StickToBottom = {
  phase: Accessor<FollowPhase>
  isAtBottom: Accessor<boolean>
  released: Accessor<boolean>
  scrollToBottom: () => void
  settle: () => void
}

type Geometry = {scrollTop: number; scrollHeight: number; clientHeight: number}

function nearestScroller(target: EventTarget | null): HTMLElement | null {
  let element = target instanceof HTMLElement ? target : null
  while (element && !SCROLLABLE_OVERFLOW.includes(getComputedStyle(element).overflowY)) element = element.parentElement
  return element
}

function readGeometry(element: HTMLElement): Geometry {
  return {scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight}
}

function endOffsetOf(geometry: Geometry): number {
  return Math.max(0, geometry.scrollHeight - geometry.clientHeight)
}

export function createStickToBottom(
  scrollElement: Accessor<HTMLElement | undefined>,
  options: StickToBottomOptions = {},
): StickToBottom {
  const [machine, setMachine] = createStore<{phase: FollowPhase}>({phase: 'settling'})
  const [children, setChildren] = createSignal<Element[]>([])
  let observed: Geometry = {scrollTop: 0, scrollHeight: 0, clientHeight: 0}

  const follows = () => options.follow?.() ?? true
  const content = () => options.content?.()
  const measured = () => content()?.measured() ?? true

  const record = (element: HTMLElement): Geometry => {
    observed = readGeometry(element)
    return observed
  }

  const distanceFromEnd = (element: HTMLElement): number => {
    const geometry = readGeometry(element)
    return endOffsetOf(geometry) - geometry.scrollTop
  }

  const pin = () => {
    const element = scrollElement()
    if (!element) return
    element.scrollTop = endOffsetOf(readGeometry(element))
    record(element)
  }

  const release = () => setMachine('phase', 'released')

  const resume = () => setMachine('phase', untrack(measured) ? 'following' : 'settling')

  const advance = () => {
    if (machine.phase === 'released' || !follows()) return
    const element = scrollElement()
    if (!element) return
    pin()
    setMachine('phase', measured() && distanceFromEnd(element) <= LANDED_TOLERANCE_PX ? 'following' : 'settling')
  }

  const settle = () => {
    setMachine('phase', 'settling')
    advance()
  }

  const handleScroll = () => {
    const element = scrollElement()
    if (!element) return
    const previous = observed
    const current = record(element)
    if (previous.scrollHeight !== current.scrollHeight || previous.clientHeight !== current.clientHeight) return
    if (machine.phase === 'following' && current.scrollTop < previous.scrollTop) {
      release()
      return
    }
    if (machine.phase === 'released' && endOffsetOf(current) - current.scrollTop <= END_THRESHOLD_PX) resume()
  }

  const handleWheel = (event: WheelEvent) => {
    const element = scrollElement()
    if (!element || event.deltaY >= 0) return
    if (element.scrollHeight <= element.clientHeight) return
    if (nearestScroller(event.target) !== element) return
    release()
  }

  const handleTouchMove = () => {
    const element = scrollElement()
    if (!element) return
    if (distanceFromEnd(element) > END_THRESHOLD_PX) release()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!RELEASING_KEYS.includes(event.key)) return
    const element = scrollElement()
    if (!element || element.scrollHeight <= element.clientHeight) return
    if (nearestScroller(event.target) !== element) return
    release()
  }

  createEffect(() => {
    const element = scrollElement()
    if (!element) return
    setChildren(Array.from(element.children))
    record(element)
    makeEventListener(element, 'scroll', handleScroll, {passive: true})
    makeEventListener(element, 'wheel', handleWheel, {passive: true})
    makeEventListener(element, 'touchmove', handleTouchMove, {passive: true})
    makeEventListener(element, 'keydown', handleKeyDown)
    createMutationObserver(element, {childList: true}, () => setChildren(Array.from(element.children)))
    createResizeObserver(
      () => [element, ...children()],
      () => untrack(advance),
    )
    untrack(settle)
  })

  createEffect(() => {
    content()?.totalSize()
    measured()
    follows()
    untrack(advance)
  })

  return {
    phase: () => machine.phase,
    isAtBottom: () => machine.phase !== 'released',
    released: () => machine.phase === 'released',
    scrollToBottom: settle,
    settle,
  }
}
