import {createSignal, For, type JSX} from 'solid-js'
import {ScrollArea} from '@ark-ui/solid/scroll-area'
import {createVirtualizer} from '@tanstack/solid-virtual'

export type VirtualLinesProps = {
  lines: string[]
  // Fixed per-row height in px (monospace lines are uniform, so windowing is exact).
  rowHeight?: number
  // The viewport cap: the scroll region never grows past this, regardless of line count.
  maxHeight?: number
  class?: string
}

const OVERSCAN = 8

// A fixed-height virtual-scrolled text region: tanstack-virtual windows the rows (only the visible
// slice is in the DOM, so 100k lines scroll smoothly) and Ark UI's ScrollArea supplies the styled
// scrollbar. The Ark Viewport is the scroll element the virtualizer measures.
export function VirtualLines(props: VirtualLinesProps): JSX.Element {
  const [viewport, setViewport] = createSignal<HTMLElement | null>(null)
  const rowHeight = () => props.rowHeight ?? 18
  const maxHeight = () => props.maxHeight ?? 360

  const virtualizer = createVirtualizer({
    get count() {
      return props.lines.length
    },
    getScrollElement: () => viewport(),
    estimateSize: () => rowHeight(),
    overscan: OVERSCAN,
  })

  // Cap the scroll region at maxHeight; shrink to the content when it is shorter.
  const height = () => Math.min(virtualizer.getTotalSize(), maxHeight())

  return (
    <ScrollArea.Root class={props.class} style={{height: `${height()}px`}}>
      <ScrollArea.Viewport ref={setViewport} class="pw-vl-viewport">
        <ScrollArea.Content style={{height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%'}}>
          <For each={virtualizer.getVirtualItems()}>
            {(item) => (
              <div
                class="pw-vl-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${item.size}px`,
                  'line-height': `${item.size}px`,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {props.lines[item.index]}
              </div>
            )}
          </For>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar class="pw-vl-bar">
        <ScrollArea.Thumb class="pw-vl-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
