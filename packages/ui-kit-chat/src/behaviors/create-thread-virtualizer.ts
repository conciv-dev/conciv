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
  exactAt: (index: number) => boolean
  gap: Accessor<number>
  overscan: Accessor<number>
  released: Accessor<boolean>
}

export type ThreadVirtualizer = {
  items: VirtualItem[]
  totalSize: Accessor<number>
  measured: Accessor<boolean>
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
    followOnAppend: false,
    scrollEndThreshold: -1,
    observeElementRect,
    observeElementOffset,
    scrollToFn: (offset, scrollOptions, virtualizer) => {
      if (!config.released()) return
      elementScroll(offset, scrollOptions, virtualizer)
    },
    onChange: () => sync(),
    useAnimationFrameWithResizeObserver: true,
  })

  const instance = new Virtualizer(resolveOptions())
  instance.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, virtualizer) =>
    config.released() && item.start < (virtualizer.scrollOffset ?? 0)

  const [items, setItems] = createStore(instance.getVirtualItems())
  const [totalSize, setTotalSize] = createSignal(instance.getTotalSize())
  const [measured, setMeasured] = createSignal(false)

  const sync = () => {
    const virtualItems = instance.getVirtualItems()
    setItems(reconcile(virtualItems, {key: 'key'}))
    setTotalSize(instance.getTotalSize())
    setMeasured(virtualItems.every((item) => instance.itemSizeCache.has(item.key) || config.exactAt(item.index)))
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
    measured,
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
