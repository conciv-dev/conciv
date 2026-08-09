import {Show, type JSX} from 'solid-js'
import {Check, CircleAlert, CircleX, LoaderCircle} from 'lucide-solid'
import type {ToolStatus} from '../primitives/tool-status.js'

function StatusIcon(props: {status: ToolStatus}): JSX.Element {
  return (
    <Show when={props.status === 'complete'} fallback={<Pending status={props.status} />}>
      <Check size={13} class="text-[color:var(--chat-success)] shrink-0" aria-hidden="true" />
    </Show>
  )
}

function Pending(props: {status: ToolStatus}): JSX.Element {
  return (
    <Show
      when={props.status === 'running'}
      fallback={
        <Show
          when={props.status === 'error'}
          fallback={<CircleAlert size={13} class="text-[color:var(--chat-accent)] shrink-0" aria-hidden="true" />}
        >
          <CircleX size={13} class="text-[color:var(--chat-danger)] shrink-0" aria-hidden="true" />
        </Show>
      }
    >
      <LoaderCircle size={13} class="text-[color:var(--chat-text-3)] shrink-0 anim-tool-spin" aria-hidden="true" />
    </Show>
  )
}

export function InlineShell(props: {name: string; status: ToolStatus; children?: JSX.Element}): JSX.Element {
  return (
    <div class="text-[color:var(--chat-text-2)] text-[length:var(--chat-text-md)] py-0.5 flex gap-2 items-center">
      <StatusIcon status={props.status} />
      <span class="flex gap-1.5 min-w-0 truncate items-center">
        <span class="text-[color:var(--chat-text)] font-medium [font-family:var(--chat-mono)]">{props.name}</span>
        {props.children}
      </span>
    </div>
  )
}

export function InlineRow(props: {label: string; status: ToolStatus; value: string}): JSX.Element {
  return (
    <InlineShell name={props.label} status={props.status}>
      <Show when={props.value}>
        <span class="text-[color:var(--chat-text-3)] truncate">{props.value}</span>
      </Show>
    </InlineShell>
  )
}
