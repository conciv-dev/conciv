import {createComputed, createEffect, createSignal, onCleanup, onMount, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import {makeEventListener} from '@solid-primitives/event-listener'
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualItem,
  type VirtualizerOptions,
} from '@tanstack/solid-virtual'

export const SCROLL_END_THRESHOLD_PX = 32

type ViewportAnchor = {mode: 'resume-following'} | {mode: 'preserve-reader-anchor'; offset: number}

type OffsetRecovery =
  | {phase: 'viewport-attached'}
  | {phase: 'offset-discarded'; anchor: ViewportAnchor}
  | {phase: 'deferred-behind-gesture'; anchor: ViewportAnchor}

function ancestorParents(element: HTMLElement): Node[] {
  const parents: Node[] = []
  let node: Node = element
  for (;;) {
    const parent = node.parentNode
    if (!parent) return parents
    parents.push(parent)
    node = parent instanceof ShadowRoot ? parent.host : parent
  }
}

function sameAncestry(left: Node[], right: Node[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index])
}

function wraps(nodes: NodeList, element: HTMLElement): boolean {
  return Array.from(nodes).some((node) => node === element || node.contains(element))
}

function observeAncestry(observer: MutationObserver, element: HTMLElement, observed: Node[]): Node[] {
  const parents = ancestorParents(element)
  if (sameAncestry(parents, observed)) return observed
  observer.disconnect()
  for (const parent of parents) observer.observe(parent, {childList: true})
  return parents
}

export type ThreadVirtualizerConfig = {
  scrollElement: Accessor<HTMLElement | undefined>
  count: Accessor<number>
  keyAt: (index: number) => string | undefined
  estimateSizeAt: (index: number) => number
  exactAt: (index: number) => boolean
  gap: Accessor<number>
  scrollMargin: Accessor<number>
  overscan: Accessor<number>
}

type ThreadLanding = {
  element: HTMLElement | undefined
  firstKey: string | undefined
  lastKey: string | undefined
}

export type ThreadVirtualizer = {
  items: VirtualItem[]
  totalSize: Accessor<number>
  measured: Accessor<boolean>
  atEnd: Accessor<boolean>
  landOnEnd: () => void
  measureRow: (element: Element) => void
  remeasure: () => void
}

export function createThreadVirtualizer(config: ThreadVirtualizerConfig): ThreadVirtualizer {
  let landedOffset: number | undefined

  const writeScroll = (offset: number, behavior: ScrollBehavior | undefined): void => {
    elementScroll(offset, {adjustments: undefined, behavior}, instance)
  }

  const landOnEnd = (): void => {
    const lastIndex = config.count() - 1
    if (lastIndex < 0) return
    const element = config.scrollElement()
    if (!element?.isConnected) return
    const target = instance.getOffsetForIndex(lastIndex, 'end')
    if (!target) return
    writeScroll(target[0], 'auto')
    landedOffset = element.scrollTop
    instance.scrollOffset = landedOffset
    restingAnchor = {mode: 'resume-following'}
    syncAtEnd()
  }

  const stillOnTheLanding = (element: HTMLElement): boolean =>
    landedOffset !== undefined && Math.abs(element.scrollTop - landedOffset) < 1

  const scrollToFn: VirtualizerOptions<HTMLElement, Element>['scrollToFn'] = (offset, options) => {
    const element = config.scrollElement()
    if (element?.isConnected && stillOnTheLanding(element)) {
      landOnEnd()
      return
    }
    writeScroll(offset + (options.adjustments ?? 0), options.behavior)
  }

  let recovery: OffsetRecovery = {phase: 'viewport-attached'}
  let restingAnchor: ViewportAnchor = {mode: 'resume-following'}
  let pointerHoldsViewport = false

  const holdViewport = (): void => {
    pointerHoldsViewport = true
  }
  const releaseViewport = (): void => {
    pointerHoldsViewport = false
  }

  const rememberAnchor = (element: HTMLElement): void => {
    restingAnchor =
      landedOffset === undefined && !atEnd()
        ? {mode: 'preserve-reader-anchor', offset: element.scrollTop}
        : {mode: 'resume-following'}
  }

  const restoreViewport = (anchor: ViewportAnchor): void => {
    update()
    const element = config.scrollElement()
    if (!element?.isConnected) return
    if (anchor.mode === 'resume-following') {
      landOnEnd()
      return
    }
    writeScroll(anchor.offset, 'auto')
    landedOffset = undefined
    instance.scrollOffset = element.scrollTop
    syncAtEnd()
    rememberAnchor(element)
  }

  const onScrolled = (): void => {
    if (recovery.phase === 'deferred-behind-gesture') {
      const {anchor} = recovery
      recovery = {phase: 'viewport-attached'}
      if (!pointerHoldsViewport) {
        restoreViewport(anchor)
        return
      }
    }
    const element = config.scrollElement()
    if (element && !stillOnTheLanding(element)) landedOffset = undefined
    syncAtEnd()
    if (element?.isConnected) rememberAnchor(element)
  }

  const onAncestryMutated = (records: MutationRecord[], element: HTMLElement): void => {
    if (recovery.phase === 'viewport-attached' && records.some((record) => wraps(record.removedNodes, element))) {
      recovery = {phase: 'offset-discarded', anchor: restingAnchor}
    }
    if (recovery.phase === 'viewport-attached' || !element.isConnected) return
    const {anchor} = recovery
    if (pointerHoldsViewport) {
      recovery = {phase: 'deferred-behind-gesture', anchor}
      return
    }
    recovery = {phase: 'viewport-attached'}
    restoreViewport(anchor)
  }

  const resolveOptions = (): VirtualizerOptions<HTMLElement, Element> => ({
    count: config.count(),
    getScrollElement: () => {
      const element = config.scrollElement()
      return element?.isConnected ? element : null
    },
    estimateSize: config.estimateSizeAt,
    getItemKey: (index) => config.keyAt(index) ?? index,
    gap: config.gap(),
    scrollMargin: config.scrollMargin(),
    overscan: config.overscan(),
    anchorTo: 'end',
    followOnAppend: false,
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
    observeElementRect,
    observeElementOffset,
    scrollToFn,
    onChange: () => update(),
    useAnimationFrameWithResizeObserver: true,
  })

  const instance = new Virtualizer(resolveOptions())

  const [items, setItems] = createStore(instance.getVirtualItems())
  const [totalSize, setTotalSize] = createSignal(instance.getTotalSize())
  const [measured, setMeasured] = createSignal(false)
  const [atEnd, setAtEnd] = createSignal(true)

  const syncAtEnd = () => {
    const element = config.scrollElement()
    setAtEnd(!element || element.scrollHeight - element.scrollTop - element.clientHeight <= SCROLL_END_THRESHOLD_PX)
  }

  const sync = () => {
    const virtualItems = instance.getVirtualItems()
    setItems(reconcile(virtualItems, {key: 'key'}))
    setTotalSize(instance.getTotalSize())
    setMeasured(virtualItems.every((item) => instance.itemSizeCache.has(item.key) || config.exactAt(item.index)))
    syncAtEnd()
  }

  const update = () => {
    instance._willUpdate()
    sync()
  }

  createComputed((previousCount: number) => {
    const nextCount = config.count()
    const followsAppend = nextCount > previousCount && instance.isAtEnd()
    instance.setOptions(resolveOptions())
    sync()
    if (!followsAppend) return nextCount
    update()
    landOnEnd()
    return nextCount
  }, 0)

  createEffect(() => {
    const element = config.scrollElement()
    createResizeObserver(element, update)
    if (element) {
      makeEventListener(element, 'scroll', onScrolled, {passive: true})
      makeEventListener(element, 'pointerdown', holdViewport, {passive: true})
      makeEventListener(element.ownerDocument, 'pointerup', releaseViewport, {passive: true})
      makeEventListener(element.ownerDocument, 'pointercancel', releaseViewport, {passive: true})
    }
    update()
  })

  createEffect(() => {
    const element = config.scrollElement()
    if (!element) return
    let observed: Node[] = []
    const observer = new MutationObserver((records) => {
      onAncestryMutated(records, element)
      if (element.isConnected) observed = observeAncestry(observer, element, observed)
    })
    observed = observeAncestry(observer, element, observed)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    totalSize()
    update()
  })

  onMount(() => {
    onCleanup(instance._didMount())
  })

  const [landing, setLanding] = createStore<ThreadLanding>({
    element: undefined,
    firstKey: undefined,
    lastKey: undefined,
  })

  const isSameThread = (element: HTMLElement, firstKey: string | undefined, lastKey: string | undefined): boolean => {
    if (landing.element !== element) return false
    if (firstKey !== undefined && landing.firstKey === firstKey) return true
    return lastKey !== undefined && landing.lastKey === lastKey
  }

  const needsLanding = (element: HTMLElement, sameThread: boolean): boolean => {
    if (!sameThread) return true
    return instance.isAtEnd() || stillOnTheLanding(element)
  }

  createEffect(() => {
    const element = config.scrollElement()
    const total = config.count()
    totalSize()
    measured()
    if (!element?.isConnected || total === 0) return
    const firstKey = config.keyAt(0)
    const lastKey = config.keyAt(total - 1)
    const sameThread = isSameThread(element, firstKey, lastKey)
    setLanding({element, firstKey, lastKey})
    if (needsLanding(element, sameThread)) landOnEnd()
  })

  return {
    items,
    totalSize,
    measured,
    atEnd,
    landOnEnd,
    measureRow: (element) => instance.measureElement(element),
    remeasure: () => {
      instance.measureElement(null)
      instance.measure()
      for (const element of instance.elementsCache.values()) {
        const index = instance.indexFromElement(element)
        if (index >= 0) instance.resizeItem(index, instance.options.measureElement(element, undefined, instance))
      }
    },
  }
}
