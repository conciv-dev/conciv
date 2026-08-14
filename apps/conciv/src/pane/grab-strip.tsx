import {createResizable} from '@conciv/ui-kit-system'
import type {JSX, ParentProps} from 'solid-js'

const GRAB_STRIP_MIN = 48

const GRABBER =
  'rounded-full bg-pw-line-2 h-2 w-11.5 cursor-ns-resize top-[0.3125rem] left-1/2 absolute z-[2] focus-visible:outline-none focus-visible:bg-pw-accent hover:bg-pw-text-3 -translate-x-1/2'

export function GrabStrip(props: ParentProps<{class: string}>): JSX.Element {
  const resize = createResizable({
    initial: 288,
    min: GRAB_STRIP_MIN,
    storageKey: 'conciv-grab-strip-height',
    grow: () => 'up',
  })
  return (
    <div class="relative flex flex-col min-h-0 shrink">
      <div
        class={GRABBER}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize grabs height"
        aria-valuemin={GRAB_STRIP_MIN}
        aria-valuenow={Math.round(resize.size())}
        tabindex={0}
        onPointerDown={resize.onPointerDown}
        onKeyDown={resize.onKeyDown}
      />
      <div class={`min-h-0 overflow-y-auto pt-4 ${props.class}`} style={{'max-height': `${resize.size()}px`}}>
        {props.children}
      </div>
    </div>
  )
}
