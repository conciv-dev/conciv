import {Show, type JSX} from 'solid-js'
import {Square} from 'lucide-solid'
import {FOCUS} from './classes.js'

// The single live "now" line that replaces per-call running spinners while a turn streams. It shows
// the active tool's title and a stop control; the host swaps `title` as the active call changes and
// the CSS cross-fades it in place. Neutral-token styled (references only --chat-*).
export function NowLine(props: {title: string; onStop?: () => void}): JSX.Element {
  return (
    <div class="text-[color:var(--chat-text)] text-[length:var(--chat-text-md)] px-2.75 py-1.75 rounded-[var(--chat-radius-pill)] flex gap-2.25 [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [font-family:var(--chat-font)] items-center">
      <span
        class="rounded-[var(--chat-radius-pill)] flex-none size-2.75 [border-top-color:var(--chat-accent)] [border:2px_solid_var(--chat-line)] anim-tool-spin motion-reduce:[animation:none]"
        aria-hidden="true"
      />
      <span class="flex-auto min-w-0 whitespace-nowrap text-ellipsis overflow-hidden anim-now">{props.title}</span>
      <Show when={props.onStop}>
        <button
          type="button"
          class={`text-[color:var(--chat-text-2)] hover:text-[color:var(--chat-danger)] text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] inline-flex flex-none size-5.5 cursor-pointer [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] items-center justify-center hover:[background:var(--chat-fill-strong)] ${FOCUS}`}
          onClick={() => props.onStop?.()}
          aria-label="Stop"
        >
          <Square size={12} fill="currentColor" aria-hidden="true" />
        </button>
      </Show>
    </div>
  )
}
