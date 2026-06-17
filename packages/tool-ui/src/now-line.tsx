import {Show, type JSX} from 'solid-js'
import {Square} from 'lucide-solid'

// The single live "now" line that replaces per-call running spinners while a turn streams. It shows
// the active tool's title and a stop control; the widget swaps `title` as the active call changes
// and the CSS cross-fades it in place.
export function NowLine(props: {title: string; onStop: () => void}): JSX.Element {
  return (
    <div class="pw-now">
      <span class="pw-now-spin" aria-hidden="true" />
      <span class="pw-now-title">{props.title}</span>
      <Show when={props.onStop}>
        <button class="pw-now-stop" onClick={() => props.onStop()} aria-label="Stop">
          <Square size={12} fill="currentColor" aria-hidden="true" />
        </button>
      </Show>
    </div>
  )
}
