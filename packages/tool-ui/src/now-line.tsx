import {Show, type JSX} from 'solid-js'
import {Square} from 'lucide-solid'

// The single live "now" line that replaces per-call running spinners while a turn streams. It shows
// the active tool's title and a stop control; the widget swaps `title` as the active call changes
// and the CSS cross-fades it in place.
export function NowLine(props: {title: string; onStop: () => void}): JSX.Element {
  return (
    <div class="text-[0.78125rem] text-pw-text font-pw px-2.75 py-1.75 border border-pw-line rounded-pw-pill bg-pw-fill flex gap-2.25 items-center">
      <span
        class="border-2 border-x-pw-line-2 border-b-pw-line-2 border-t-pw-accent rounded-pw-pill flex-none size-2.75 anim-tool-spin"
        aria-hidden="true"
      />
      <span class="flex-auto min-w-0 whitespace-nowrap text-ellipsis overflow-hidden anim-now">{props.title}</span>
      <Show when={props.onStop}>
        <button
          class="text-[0.625rem] text-pw-text-2 border border-pw-line-2 rounded-pw-sm bg-pw-fill inline-flex flex-none size-5.5 cursor-pointer items-center justify-center hover:text-pw-danger hover:bg-pw-fill-strong focus-ring"
          onClick={() => props.onStop()}
          aria-label="Stop"
        >
          <Square size={12} fill="currentColor" aria-hidden="true" />
        </button>
      </Show>
    </div>
  )
}
