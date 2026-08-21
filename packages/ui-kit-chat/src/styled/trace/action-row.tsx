import {Show, splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {FOCUS} from '../classes.js'
import {TraceConnector, TRACE_INDENT} from './connector.js'

const ROW = `flex items-center gap-2 min-w-0 ${TRACE_INDENT}`
const BUTTON = `inline-flex flex-none items-center justify-center min-h-7 px-2.5 rounded-[var(--chat-radius-sm)] text-[12px] font-medium leading-none cursor-pointer [font-family:var(--chat-font)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] text-chat-text hover:[background:var(--chat-fill-strong)] [transition:background-color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] motion-reduce:[transition:none] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`
const HINT = 'flex-none text-[9px] leading-none [font-family:var(--chat-mono)] text-chat-hint'
const EXPLAINER = 'flex-1 min-w-0 truncate text-[12px] leading-[1.45] [font-family:var(--chat-font)] text-chat-text-2'

export function TraceActionRow(props: {
  label: string
  hint?: string
  explainer?: string
  disabled?: boolean
  last?: boolean
  onAction?: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'explainer', 'disabled', 'last', 'onAction'])
  return (
    <li class="relative list-none min-w-0 pb-[3px]">
      <TraceConnector joint={(local.last ?? false) ? 'corner' : 'line'} />
      <div class={ROW}>
        <Button variant="plain" size="none" class={BUTTON} disabled={local.disabled} onClick={() => local.onAction?.()}>
          {local.label}
        </Button>
        <Show when={local.hint}>{(hint) => <span class={HINT}>{hint()}</span>}</Show>
        <Show when={local.explainer}>{(explainer) => <span class={EXPLAINER}>{explainer()}</span>}</Show>
      </div>
    </li>
  )
}
