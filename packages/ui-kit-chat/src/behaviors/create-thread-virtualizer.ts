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

  const onScrolled = (): void => {
    const element = config.scrollElement()
    if (element && !stillOnTheLanding(element)) landedOffset = undefined
    syncAtEnd()
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

  const syncAtEnd = () => setAtEnd(instance.isAtEnd())

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
    if (element) makeEventListener(element, 'scroll', onScrolled, {passive: true})
    update()
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
