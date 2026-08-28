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
  keyAt: (index: number) => string
  estimateSizeAt: (index: number) => number
  exactAt: (index: number) => boolean
  gap: Accessor<number>
  overscan: Accessor<number>
}

export type ThreadVirtualizer = {
  items: VirtualItem[]
  totalSize: Accessor<number>
  measured: Accessor<boolean>
  atEnd: Accessor<boolean>
  scrollToEnd: () => void
  measureRow: (element: Element) => void
  remeasure: () => void
}

export function createThreadVirtualizer(config: ThreadVirtualizerConfig): ThreadVirtualizer {
  const resolveOptions = (): VirtualizerOptions<HTMLElement, Element> => ({
    count: config.count(),
    getScrollElement: () => {
      const element = config.scrollElement()
      return element?.isConnected ? element : null
    },
    estimateSize: config.estimateSizeAt,
    getItemKey: config.keyAt,
    gap: config.gap(),
    overscan: config.overscan(),
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => sync(),
    useAnimationFrameWithResizeObserver: true,
  })

  const instance = new Virtualizer(resolveOptions())

  const [items, setItems] = createStore(instance.getVirtualItems())
  const [totalSize, setTotalSize] = createSignal(instance.getTotalSize())
  const [measured, setMeasured] = createSignal(false)
  const [atEnd, setAtEnd] = createSignal(true)

  const virtualDistanceFromEnd = (): number => {
    const element = config.scrollElement()
    if (!element) return 0
    return Math.max(0, instance.getTotalSize() - element.clientHeight - (instance.scrollOffset ?? 0))
  }

  const syncAtEnd = () => setAtEnd(virtualDistanceFromEnd() <= SCROLL_END_THRESHOLD_PX)

  const sync = () => {
    const virtualItems = instance.getVirtualItems()
    setItems(reconcile(virtualItems, {key: 'key'}))
    setTotalSize(instance.getTotalSize())
    setMeasured(virtualItems.every((item) => instance.itemSizeCache.has(item.key) || config.exactAt(item.index)))
    syncAtEnd()
  }

  const bindScrollElement = () => {
    instance._willUpdate()
    sync()
  }

  createComputed(() => {
    config.scrollElement()
    instance.setOptions(resolveOptions())
    sync()
  })

  createEffect(() => {
    const element = config.scrollElement()
    createResizeObserver(element, bindScrollElement)
    if (element) makeEventListener(element, 'scroll', syncAtEnd, {passive: true})
    bindScrollElement()
  })

  onMount(() => {
    onCleanup(instance._didMount())
  })

  return {
    items,
    totalSize,
    measured,
    atEnd,
    scrollToEnd: () => instance.scrollToEnd(),
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
