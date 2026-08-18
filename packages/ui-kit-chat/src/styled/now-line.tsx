import {Show, type JSX} from 'solid-js'
import Square from 'lucide-solid/icons/square'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {FOCUS} from './classes.js'

const STOP_LABEL = 'Stop'
const STOP_BUTTON = `text-chat-text-2 hover:text-chat-danger text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] inline-flex flex-none size-5.5 cursor-pointer [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] items-center justify-center hover:[background:var(--chat-fill-strong)] ${FOCUS}`

export function NowLine(props: {title: string; onStop?: () => void}): JSX.Element {
  return (
    <div
      role="status"
      class="text-chat-text text-[length:var(--chat-text-md)] px-2.75 py-1.75 rounded-[var(--chat-radius-pill)] flex gap-2.25 [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [font-family:var(--chat-font)] items-center"
    >
      <span
        class="rounded-[var(--chat-radius-pill)] flex-none size-2.75 [border-top-color:var(--chat-accent)] [border:2px_solid_var(--chat-line)] anim-tool-spin"
        aria-hidden="true"
      />
      <span class="flex-auto min-w-0 whitespace-nowrap text-ellipsis overflow-hidden anim-now">{props.title}</span>
      <Show when={props.onStop}>
        <TooltipIconButtonSlot tooltip={STOP_LABEL} wrapperClass="flex-none">
          {(buttonProps) => (
            <button {...buttonProps()} class={STOP_BUTTON} onClick={() => props.onStop?.()}>
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </button>
          )}
        </TooltipIconButtonSlot>
      </Show>
    </div>
  )
}
