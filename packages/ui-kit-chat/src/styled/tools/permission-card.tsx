import {Show, type JSX} from 'solid-js'
import {Check, ShieldAlert, X} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Permission, usePermission} from '../../primitives/tools/permission.js'

const BTN =
  'flex-none inline-flex items-center gap-1 py-1 px-2.5 rounded-[var(--chat-radius-sm)] [border:1px_solid] font-semibold text-[length:var(--chat-text-sm)] leading-none cursor-pointer'
const DENY = `${BTN} text-[color:var(--chat-text-2)] [border-color:var(--chat-line)] [background:var(--chat-fill)] hover:[color:var(--chat-danger)] hover:[background:var(--chat-fill-strong)]`
const ALLOW = `${BTN} text-[color:var(--chat-on-accent)] [border-color:var(--chat-accent)] [background:var(--chat-accent)] hover:[background:var(--chat-accent-hi)]`

function Prompt(props: {label?: string}): JSX.Element {
  const permission = usePermission()
  return (
    <Show when={permission.pending()}>
      <div
        class="text-[color:var(--chat-text)] text-[length:var(--chat-text-md)] mb-1.5 mt-1 px-2.5 py-2 rounded-[var(--chat-radius-md)] flex flex-wrap gap-2 [background:var(--chat-fill)] [border:1px_solid_var(--chat-accent)] items-center anim-msg-lg"
        role="group"
        aria-label="Approve this action?"
      >
        <span class="text-[color:var(--chat-accent)] inline-flex" aria-hidden="true">
          <ShieldAlert size={14} />
        </span>
        <span class="flex-auto min-w-0">{props.label ?? 'Run this action?'}</span>
        <button type="button" class={DENY} onClick={() => permission.reject()}>
          <X size={13} aria-hidden="true" />
          Deny
        </button>
        <button type="button" class={ALLOW} onClick={() => permission.approve()}>
          <Check size={13} aria-hidden="true" />
          Allow
        </button>
      </div>
    </Show>
  )
}

export function PermissionCard(props: ToolCardProps & {label?: string}): JSX.Element {
  return (
    <Permission.Root part={props.part} ctx={props.ctx}>
      <Prompt label={props.label} />
    </Permission.Root>
  )
}
