import {Show, type JSX} from 'solid-js'
import {StatusVisual} from '../primitives/status-visual.js'
import type {ToolStatus} from '../primitives/tool-status.js'

export function InlineShell(props: {name: string; status: ToolStatus; children?: JSX.Element}): JSX.Element {
  return (
    <div class="text-chat-text-2 text-[length:var(--chat-text-md)] py-0.5 flex gap-2 items-center">
      <StatusVisual status={props.status} form="icon" />
      <span class="flex gap-1.5 min-w-0 items-center">
        <span class="text-chat-text font-medium [font-family:var(--chat-mono)]">{props.name}</span>
        {props.children}
      </span>
    </div>
  )
}

export function InlineRow(props: {label: string; status: ToolStatus; value: string}): JSX.Element {
  return (
    <InlineShell name={props.label} status={props.status}>
      <Show when={props.value}>
        <span class="text-chat-text-3 truncate">{props.value}</span>
      </Show>
    </InlineShell>
  )
}
