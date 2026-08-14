import {createResizable} from '@conciv/ui-kit-system'
import type {JSX, ParentProps} from 'solid-js'

const GRAB_STRIP_MIN = 48

const GRABBER =
  'rounded-full bg-pw-line-2 h-1.5 w-9 cursor-ns-resize top-1 left-1/2 absolute z-[2] opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:bg-pw-accent hover:bg-pw-text-3 -translate-x-1/2'

export function GrabStrip(props: ParentProps<{class: string}>): JSX.Element {
  const resize = createResizable({
    initial: 288,
    min: GRAB_STRIP_MIN,
    storageKey: 'conciv-grab-strip-height',
    grow: () => 'up',
  })
  let scroller: HTMLDivElement | undefined
  const clampToRendered = () => {
    if (scroller) resize.set(Math.min(resize.size(), scroller.getBoundingClientRect().height))
  }
  return (
    <div class="relative flex flex-col min-h-0 shrink group">
      <div
        class={GRABBER}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize grabs height"
        aria-valuemin={GRAB_STRIP_MIN}
        aria-valuenow={Math.round(resize.size())}
        tabindex={0}
        onPointerDown={(event) => {
          clampToRendered()
          resize.onPointerDown(event)
        }}
        onKeyDown={(event) => {
          clampToRendered()
          resize.onKeyDown(event)
        }}
      />
      <div
        ref={(el) => {
          scroller = el
        }}
        class={`min-h-0 max-h-max overflow-y-auto pt-3 ${props.class}`}
        style={{height: `${resize.size()}px`}}
      >
        {props.children}
      </div>
    </div>
  )
}
