import {createComputed, createSignal, onCleanup, onMount, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualItem,
  type VirtualizerOptions,
} from '@tanstack/solid-virtual'

export type ThreadVirtualizerConfig = {
  scrollElement: Accessor<HTMLElement | undefined>
  count: Accessor<number>
  keyAt: (index: number) => string
  estimateSizeAt: (index: number) => number
  gap: Accessor<number>
  ownsViewport: Accessor<boolean>
}

export type ThreadVirtualizer = {
  items: VirtualItem[]
  totalSize: Accessor<number>
  measureRow: (element: Element) => void
  scrollToLast: () => void
  scrollToAnchor: (index: number, offsetInViewport: number) => void
  remeasure: () => void
}

export function createThreadVirtualizer(config: ThreadVirtualizerConfig): ThreadVirtualizer {
  const resolveOptions = (): VirtualizerOptions<HTMLElement, Element> => ({
    count: config.count(),
    getScrollElement: () => config.scrollElement() ?? null,
    estimateSize: config.estimateSizeAt,
    getItemKey: config.keyAt,
    gap: config.gap(),
    overscan: 8,
    anchorTo: 'end',
    followOnAppend: false,
    scrollEndThreshold: -1,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => sync(),
    useAnimationFrameWithResizeObserver: true,
  })

  const instance = new Virtualizer(resolveOptions())
  instance.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, virtualizer) =>
    !config.ownsViewport() && item.start < (virtualizer.scrollOffset ?? 0)

  const [items, setItems] = createStore(instance.getVirtualItems())
  const [totalSize, setTotalSize] = createSignal(instance.getTotalSize())

  const sync = () => {
    setItems(reconcile(instance.getVirtualItems(), {key: 'key'}))
    setTotalSize(instance.getTotalSize())
  }

  createComputed(() => {
    config.scrollElement()
    instance.setOptions(resolveOptions())
    instance._willUpdate()
    sync()
  })

  onMount(() => {
    const cleanup = instance._didMount()
    instance._willUpdate()
    sync()
    onCleanup(cleanup)
  })

  return {
    items,
    totalSize,
    measureRow: (element) => instance.measureElement(element),
    scrollToLast: () => {
      const count = config.count()
      if (count > 0) instance.scrollToIndex(count - 1, {align: 'end'})
    },
    scrollToAnchor: (index, offsetInViewport) => {
      const start = instance.measurementsCache[index]?.start ?? index * config.estimateSizeAt(index)
      instance.scrollToOffset(start - offsetInViewport)
    },
    remeasure: () => {
      instance.measure()
      for (const element of instance.elementsCache.values()) {
        const index = instance.indexFromElement(element)
        if (index >= 0) instance.resizeItem(index, instance.options.measureElement(element, undefined, instance))
      }
    },
  }
}
