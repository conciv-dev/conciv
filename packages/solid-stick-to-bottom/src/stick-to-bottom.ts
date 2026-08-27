import {createEffect, createRoot, getOwner, onCleanup, untrack, type Accessor} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {makeTimer} from '@solid-primitives/timer'

const DEFAULT_SPRING_ANIMATION = {damping: 0.7, stiffness: 0.05, mass: 1.25}
const STICK_TO_BOTTOM_OFFSET_PX = 70
const SIXTY_FPS_INTERVAL_MS = 1000 / 60
const RETAIN_ANIMATION_DURATION_MS = 350
const SETTLE_DELAY_MS = 1
const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll'])

export type SpringAnimation = {damping: number; stiffness: number; mass: number}
export type Animation = 'instant' | Partial<SpringAnimation>
type ResolvedAnimation = 'instant' | Readonly<SpringAnimation>

export type ScrollToBottomOptions = {
  animation?: Animation
  wait?: boolean | number
  ignoreEscapes?: boolean
  preserveScrollPosition?: boolean
  duration?: number
}

export type StickToBottomOptions = {
  initial?: Animation | boolean
  resize?: Animation
  follow?: Accessor<boolean>
}

export type StickToBottom = {
  isAtBottom: Accessor<boolean>
  isNearBottom: Accessor<boolean>
  escapedFromLock: Accessor<boolean>
  scrollToBottom: (options?: ScrollToBottomOptions) => Promise<boolean>
  stopScroll: () => void
}

type RunningAnimation = {behavior: ResolvedAnimation; ignoreEscapes: boolean; promise: Promise<boolean>}

type MotionState = {
  lastScrollTop?: number
  ignoreScrollToTop?: number
  resizeDifference: number
  animation?: RunningAnimation
  lastTick?: number
  velocity: number
  accumulated: number
}

const animationCache = new Map<string, Readonly<SpringAnimation>>()

function mergeAnimations(...animations: Array<Animation | boolean | undefined>): ResolvedAnimation {
  const result = {...DEFAULT_SPRING_ANIMATION}
  let instant = false
  for (const animation of animations) {
    if (animation === 'instant') {
      instant = true
      continue
    }
    if (typeof animation !== 'object') continue
    instant = false
    result.damping = animation.damping ?? result.damping
    result.stiffness = animation.stiffness ?? result.stiffness
    result.mass = animation.mass ?? result.mass
  }
  if (instant) return 'instant'
  const key = JSON.stringify(result)
  const cached = animationCache.get(key)
  if (cached) return cached
  const frozen = Object.freeze(result)
  animationCache.set(key, frozen)
  return frozen
}

type SelectionRoot = {getSelection: () => Selection | null}

function hasGetSelection(node: Node): node is Node & SelectionRoot {
  return 'getSelection' in node && typeof node.getSelection === 'function'
}

function selectionTouches(element: HTMLElement): boolean {
  const root = element.getRootNode()
  const selection = hasGetSelection(root) ? root.getSelection() : null
  if (!selection || !selection.rangeCount) return false
  const range = selection.getRangeAt(0)
  return range.commonAncestorContainer.contains(element) || element.contains(range.commonAncestorContainer)
}

function nearestScroller(target: EventTarget | null): HTMLElement | null {
  let element = target instanceof HTMLElement ? target : null
  while (element && !SCROLLABLE_OVERFLOW.has(getComputedStyle(element).overflowY)) element = element.parentElement
  return element
}

function observeContent(element: HTMLElement, onResize: () => void): () => void {
  const resizeObserver = new ResizeObserver(onResize)
  const observed = new WeakSet<Element>()
  const observeChild = (child: Element) => {
    if (observed.has(child)) return
    observed.add(child)
    resizeObserver.observe(child)
  }
  const observeChildren = () => {
    for (const child of element.children) observeChild(child)
  }
  const mutationObserver = new MutationObserver(observeChildren)
  mutationObserver.observe(element, {childList: true, subtree: true})
  resizeObserver.observe(element)
  observeChildren()
  return () => {
    resizeObserver.disconnect()
    mutationObserver.disconnect()
  }
}

export function createStickToBottom(
  scrollElement: Accessor<HTMLElement | undefined>,
  options: StickToBottomOptions = {},
): StickToBottom {
  const [state, setState] = createStore({
    isAtBottom: options.initial !== false,
    isNearBottom: false,
    escapedFromLock: false,
  })
  const motion: MotionState = {resizeDifference: 0, velocity: 0, accumulated: 0}
  const owner = getOwner()
  let pointerIsDown = false
  let previousHeight: number | undefined
  let disposeScrollSettle: (() => void) | undefined
  let declaredScrollBehavior = 'auto'

  const afterSettle = (task: () => void) =>
    createRoot((dispose) => {
      makeTimer(
        () => {
          dispose()
          task()
        },
        SETTLE_DELAY_MS,
        setTimeout,
      )
      return dispose
    }, owner ?? undefined)

  const cancelScrollSettle = () => {
    disposeScrollSettle?.()
    disposeScrollSettle = undefined
  }

  const scheduleScrollSettle = (task: () => void) => {
    cancelScrollSettle()
    disposeScrollSettle = afterSettle(() => {
      disposeScrollSettle = undefined
      task()
    })
  }

  const scrollTop = () => scrollElement()?.scrollTop ?? 0

  const setScrollTop = (value: number) => {
    const element = scrollElement()
    if (!element) return
    const overridden = declaredScrollBehavior !== 'auto'
    if (overridden) element.style.scrollBehavior = 'auto'
    element.scrollTop = value
    motion.ignoreScrollToTop = element.scrollTop
    if (overridden) element.style.scrollBehavior = declaredScrollBehavior
  }

  const targetScrollTop = () => {
    const element = scrollElement()
    if (!element) return 0
    return element.scrollHeight - 1 - element.clientHeight
  }

  const isNearBottomAt = (currentScrollTop: number, target: number) =>
    target - Math.min(currentScrollTop, target) <= STICK_TO_BOTTOM_OFFSET_PX

  const stuckToBottom = () => untrack(() => state.isAtBottom)
  const escaped = () => untrack(() => state.escapedFromLock)

  const scrollDifference = () => targetScrollTop() - scrollTop()
  const nearBottom = () => scrollDifference() <= STICK_TO_BOTTOM_OFFSET_PX
  const follows = () => options.follow?.() ?? true

  const isSelecting = () => {
    if (!pointerIsDown) return false
    const element = scrollElement()
    if (!element) return false
    return selectionTouches(element)
  }

  const beginTick = (running: RunningAnimation): number => {
    const tick = performance.now()
    const tickDelta = (tick - (motion.lastTick ?? tick)) / SIXTY_FPS_INTERVAL_MS
    motion.animation ||= running
    if (motion.animation.behavior === running.behavior) motion.lastTick = tick
    return tickDelta
  }

  const advance = (behavior: ResolvedAnimation, startedAtScrollTop: number, tickDelta: number) => {
    const element = scrollElement()
    if (!element) return
    const target = element.scrollHeight - 1 - element.clientHeight
    if (behavior === 'instant') {
      setScrollTop(target)
      return
    }
    const current = element.scrollTop
    motion.velocity = (behavior.damping * motion.velocity + behavior.stiffness * (target - current)) / behavior.mass
    motion.accumulated += motion.velocity * tickDelta
    setScrollTop(current + motion.accumulated)
    if (motion.ignoreScrollToTop !== startedAtScrollTop) motion.accumulated = 0
  }

  const scrollToBottom = (scrollOptions: ScrollToBottomOptions = {}): Promise<boolean> => {
    const finish = (ignoreEscapes: boolean, durationElapsed: number): boolean | Promise<boolean> => {
      motion.animation = undefined
      if (scrollTop() >= targetScrollTop()) return stuckToBottom()
      return scrollToBottom({
        animation: mergeAnimations(options.resize),
        ignoreEscapes,
        duration: Math.max(0, durationElapsed - Date.now()) || undefined,
      })
    }

    if (!scrollOptions.preserveScrollPosition) {
      if (!stuckToBottom()) cancelScrollSettle()
      setState('isAtBottom', true)
    }

    const waitElapsed = Date.now() + (Number(scrollOptions.wait) || 0)
    const behavior = mergeAnimations(scrollOptions.animation)
    const ignoreEscapes = scrollOptions.ignoreEscapes ?? false
    const durationElapsed = waitElapsed + (scrollOptions.duration ?? 0)
    let startTarget = targetScrollTop()

    const next = (): Promise<boolean> => {
      const promise = new Promise<number>(requestAnimationFrame).then((): boolean | Promise<boolean> => {
        if (!stuckToBottom()) {
          motion.animation = undefined
          return false
        }

        const startedAtScrollTop = scrollTop()
        const tickDelta = beginTick({behavior, ignoreEscapes, promise})

        if (isSelecting()) return next()
        if (waitElapsed > Date.now()) return next()

        if (startedAtScrollTop < Math.min(startTarget, targetScrollTop())) {
          if (motion.animation?.behavior === behavior) advance(behavior, startedAtScrollTop, tickDelta)
          return next()
        }

        if (durationElapsed > Date.now()) {
          startTarget = targetScrollTop()
          return next()
        }

        return finish(ignoreEscapes, durationElapsed)
      })

      return promise.then((isAtBottom) => {
        requestAnimationFrame(() => {
          if (motion.animation) return
          motion.lastTick = undefined
          motion.velocity = 0
        })
        return isAtBottom
      })
    }

    if (scrollOptions.wait !== true) motion.animation = undefined
    if (motion.animation?.behavior === behavior) return motion.animation.promise
    return next()
  }

  const stopScroll = () => setState({escapedFromLock: true, isAtBottom: false})

  const applyScrollDirection = (currentScrollTop: number, lastScrollTop: number) => {
    if (currentScrollTop < lastScrollTop) setState({escapedFromLock: true, isAtBottom: false})
    if (currentScrollTop > lastScrollTop) setState('escapedFromLock', false)
    if (!escaped() && nearBottom()) setState('isAtBottom', true)
  }

  const handleScroll = (event: Event) => {
    const element = scrollElement()
    if (!element || event.target !== element) return

    const currentScrollTop = element.scrollTop
    const ignoreScrollToTop = motion.ignoreScrollToTop
    let lastScrollTop = motion.lastScrollTop ?? currentScrollTop

    motion.lastScrollTop = currentScrollTop
    motion.ignoreScrollToTop = undefined

    if (ignoreScrollToTop && ignoreScrollToTop > currentScrollTop) lastScrollTop = ignoreScrollToTop

    setState('isNearBottom', nearBottom())

    scheduleScrollSettle(() => {
      if (motion.resizeDifference || currentScrollTop === ignoreScrollToTop) return

      if (isSelecting()) {
        setState({escapedFromLock: true, isAtBottom: false})
        return
      }

      if (motion.animation?.ignoreEscapes) {
        setScrollTop(lastScrollTop)
        return
      }

      applyScrollDirection(currentScrollTop, lastScrollTop)
    })
  }

  const handleWheel = (event: WheelEvent) => {
    const element = scrollElement()
    if (!element || event.deltaY >= 0) return
    if (nearestScroller(event.target) !== element) return
    if (element.scrollHeight <= element.clientHeight) return
    if (motion.animation?.ignoreEscapes) return
    setState({escapedFromLock: true, isAtBottom: false})
  }

  const handleContentResize = () => {
    const element = scrollElement()
    if (!element) return

    const height = element.scrollHeight
    const target = height - 1 - element.clientHeight
    const currentScrollTop = element.scrollTop
    const difference = height - (previousHeight ?? height)
    const settledNearBottom = isNearBottomAt(currentScrollTop, target)
    motion.resizeDifference = difference

    if (currentScrollTop > target) setScrollTop(target)
    setState('isNearBottom', settledNearBottom)

    if (difference >= 0) {
      const animation = mergeAnimations(previousHeight === undefined ? options.initial : options.resize)
      if (follows()) {
        void scrollToBottom({
          animation,
          wait: true,
          preserveScrollPosition: true,
          duration: animation === 'instant' ? undefined : RETAIN_ANIMATION_DURATION_MS,
        })
      }
    } else if (settledNearBottom) {
      setState({escapedFromLock: false, isAtBottom: true})
    }

    previousHeight = height

    requestAnimationFrame(() => {
      afterSettle(() => {
        if (motion.resizeDifference === difference) motion.resizeDifference = 0
      })
    })
  }

  createEffect(() => {
    makeEventListener(document, 'mousedown', () => {
      pointerIsDown = true
    })
    makeEventListener(document, 'mouseup', () => {
      pointerIsDown = false
    })
    makeEventListener(document, 'click', () => {
      pointerIsDown = false
    })
  })

  createEffect(() => {
    const element = scrollElement()
    if (!element) return
    previousHeight = undefined
    declaredScrollBehavior = getComputedStyle(element).scrollBehavior
    makeEventListener(element, 'scroll', handleScroll, {passive: true})
    makeEventListener(element, 'wheel', handleWheel, {passive: true})
    onCleanup(observeContent(element, handleContentResize))
  })

  return {
    isAtBottom: () => state.isAtBottom || state.isNearBottom,
    isNearBottom: () => state.isNearBottom,
    escapedFromLock: () => state.escapedFromLock,
    scrollToBottom,
    stopScroll,
  }
}
