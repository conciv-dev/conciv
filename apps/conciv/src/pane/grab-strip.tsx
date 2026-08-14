import {createResizable} from '@conciv/ui-kit-system'
import {createSignal, type JSX, type ParentProps} from 'solid-js'

const GRAB_STRIP_MIN = 48

const GRABBER_HIT =
  'flex items-center justify-center h-4 w-24 rounded-pw-pill cursor-ns-resize self-center shrink-0 touch-none trans-color-bg hover:bg-pw-fill-strong focus-visible:outline-none focus-visible:bg-pw-accent-20'
const GRABBER_PILL =
  'rounded-full bg-pw-line-2 h-1.5 w-9 opacity-0 transition-opacity duration-150 group-hover:opacity-100'

export function GrabStrip(props: ParentProps<{class: string}>): JSX.Element {
  let scroller: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined
  const resize = createResizable({
    initial: 288,
    min: GRAB_STRIP_MIN,
    max: () => content?.offsetHeight ?? Number.POSITIVE_INFINITY,
    grow: () => 'up',
  })
  const [sized, setSized] = createSignal(false)
  const beginResize = () => {
    if (scroller) resize.set(scroller.getBoundingClientRect().height)
    setSized(true)
  }
  return (
    <div class="flex flex-col min-h-0 shrink group gap-1 pt-1">
      <div
        class={GRABBER_HIT}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize grabs height"
        aria-valuemin={GRAB_STRIP_MIN}
        aria-valuenow={Math.round(resize.size())}
        tabindex={0}
        onPointerDown={(event) => {
          beginResize()
          resize.onPointerDown(event)
        }}
        onKeyDown={(event) => {
          beginResize()
          resize.onKeyDown(event)
        }}
      >
        <div class={GRABBER_PILL} />
      </div>
      <div
        ref={(el) => {
          scroller = el
        }}
        class="min-h-0 overflow-y-auto"
        style={sized() ? {height: `${resize.size()}px`} : undefined}
      >
        <div
          ref={(el) => {
            content = el
          }}
          class={props.class}
        >
          {props.children}
        </div>
      </div>
    </div>
  )
}
