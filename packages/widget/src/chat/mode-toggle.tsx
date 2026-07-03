import {type JSX} from 'solid-js'
import {MessageSquare, SquareTerminal} from 'lucide-solid'
import type {SessionMode} from '@conciv/protocol/terminal-types'

const SEG = 'inline-flex rounded-[8px] bg-pw-fill p-0.5 gap-0.5'
const BTN =
  'inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[0.6875rem] font-medium font-pw [border:none] cursor-pointer trans-color-bg disabled:opacity-40 disabled:cursor-default'
const ON = 'bg-pw-fill-strong text-pw-text-hi'
const OFF = 'bg-transparent text-pw-text-2 hover:text-pw-text-hi'

export function ModeToggle(props: {
  mode: SessionMode
  busy: boolean
  onChange: (mode: SessionMode) => void
}): JSX.Element {
  const segment = (mode: SessionMode, label: string, icon: JSX.Element): JSX.Element => (
    <button
      type="button"
      class={BTN}
      classList={{[ON]: props.mode === mode, [OFF]: props.mode !== mode}}
      disabled={props.busy}
      title={props.busy ? 'finishing current turn…' : undefined}
      aria-pressed={props.mode === mode}
      onClick={() => props.onChange(mode)}
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div class={SEG} role="group" aria-label="View mode">
      {segment('chat', 'Chat', <MessageSquare class="size-3" aria-hidden="true" />)}
      {segment('terminal', 'Terminal', <SquareTerminal class="size-3" aria-hidden="true" />)}
    </div>
  )
}
