import {For, Show, onMount, type JSX} from 'solid-js'
import {createVirtualizer} from '@tanstack/solid-virtual'

export type VirtualListProps<Row> = {
  rows: readonly Row[]
  sizeOf: (row: Row) => number
  children: (row: Row) => JSX.Element
  more?: boolean
  moreRow?: JSX.Element
  moreRowSize?: number
  onReachMore?: () => Promise<unknown> | undefined
  onScroller?: (scrollToRow: (index: number) => void) => void
  class?: string
}

const OVERSCAN = 6

export function VirtualList<Row>(props: VirtualListProps<Row>): JSX.Element {
  let scroller: HTMLDivElement | undefined
  const moreIndex = () => props.rows.length
  const virtualizer = createVirtualizer({
    get count() {
      return props.more ? props.rows.length + 1 : props.rows.length
    },
    get getItemKey() {
      const rows = props.rows
      return (index: number) => (rows[index] === undefined ? 'more' : index)
    },
    getScrollElement: () => scroller ?? null,
    estimateSize: (index) => {
      const row = props.rows[index]
      return row === undefined ? (props.moreRowSize ?? 0) : props.sizeOf(row)
    },
    overscan: OVERSCAN,
    useAnimationFrameWithResizeObserver: true,
    onChange: () => reachMore(),
  })
  const reachMore = (): void => {
    const last = virtualizer.getVirtualItems().at(-1)
    if (!props.more || last === undefined || last.index < moreIndex()) return
    void props.onReachMore?.()?.then(reachMore)
  }
  onMount(() => props.onScroller?.((index) => virtualizer.scrollToIndex(index, {align: 'auto'})))
  return (
    <div
      ref={(element) => {
        scroller = element
      }}
      class={props.class}
    >
      <div role="presentation" style={{position: 'relative', 'block-size': `${virtualizer.getTotalSize()}px`}}>
        <For each={virtualizer.getVirtualItems()}>
          {(item) => (
            <div
              role="presentation"
              data-index={item.index}
              ref={(element) => queueMicrotask(() => virtualizer.measureElement(element))}
              style={{
                position: 'absolute',
                'inset-block-start': '0',
                'inset-inline-start': '0',
                'inline-size': '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <Show when={props.rows[item.index]} fallback={props.moreRow} keyed>
                {(row) => props.children(row)}
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
