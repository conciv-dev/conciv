import {createComputed, createEffect, createSignal, onCleanup, onMount, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {createResizeObserver} from '@solid-primitives/resize-observer'
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
    getScrollElement: () => {
      const element = config.scrollElement()
      return element?.isConnected ? element : null
    },
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
    createResizeObserver(config.scrollElement(), bindScrollElement)
    bindScrollElement()
  })

  onMount(() => {
    onCleanup(instance._didMount())
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
