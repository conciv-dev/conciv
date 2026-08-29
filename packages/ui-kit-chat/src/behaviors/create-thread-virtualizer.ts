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
  paddingStart: Accessor<number>
  paddingEnd: Accessor<number>
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
  let publishScrollOffset: ((offset: number, isScrolling: boolean) => void) | undefined

  const trackScrollOffset: VirtualizerOptions<HTMLElement, Element>['observeElementOffset'] = (
    virtualizer,
    onChange,
  ) => {
    publishScrollOffset = onChange
    onChange(virtualizer.scrollElement?.scrollTop ?? 0, false)
    return observeElementOffset(virtualizer, onChange)
  }

  const readbackScrollOffset = (element: HTMLElement): void => publishScrollOffset?.(element.scrollTop, false)

  let lastLandedOffset: number | undefined

  const landOnEnd = (): void => {
    const element = config.scrollElement()
    if (!element) return
    const lastIndex = config.count() - 1
    if (lastIndex < 0) return
    const target = instance.getOffsetForIndex(lastIndex, 'end')
    if (!target) return
    elementScroll(target[0], {adjustments: undefined, behavior: 'auto'}, instance)
    lastLandedOffset = element.scrollTop
    readbackScrollOffset(element)
  }

  const restingAtEnd = (element: HTMLElement): boolean =>
    element.scrollHeight - element.clientHeight - element.scrollTop <= SCROLL_END_THRESHOLD_PX

  const stillLandingOnEnd = (element: HTMLElement): boolean =>
    element.scrollTop === lastLandedOffset || restingAtEnd(element)

  const resolveOptions = (): VirtualizerOptions<HTMLElement, Element> => ({
    count: config.count(),
    getScrollElement: () => {
      const element = config.scrollElement()
      return element?.isConnected ? element : null
    },
    estimateSize: config.estimateSizeAt,
    getItemKey: config.keyAt,
    gap: config.gap(),
    paddingStart: config.paddingStart(),
    paddingEnd: config.paddingEnd(),
    overscan: config.overscan(),
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
    observeElementRect,
    observeElementOffset: trackScrollOffset,
    scrollToFn: elementScroll,
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

  createComputed(() => {
    config.scrollElement()
    instance.setOptions(resolveOptions())
    sync()
  })

  createEffect(() => {
    const element = config.scrollElement()
    createResizeObserver(element, update)
    if (element) makeEventListener(element, 'scroll', syncAtEnd, {passive: true})
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

  createEffect(() => {
    const element = config.scrollElement()
    const total = config.count()
    totalSize()
    measured()
    if (!element?.isConnected || total === 0) return
    const firstKey = config.keyAt(0)
    const lastKey = config.keyAt(total - 1)
    const sameThread = landing.element === element && (landing.firstKey === firstKey || landing.lastKey === lastKey)
    setLanding({element, firstKey, lastKey})
    if (sameThread && !stillLandingOnEnd(element)) return
    landOnEnd()
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
