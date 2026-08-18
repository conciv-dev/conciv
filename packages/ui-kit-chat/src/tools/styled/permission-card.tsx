import {Show, type JSX} from 'solid-js'
import Check from 'lucide-solid/icons/check'
import ShieldAlert from 'lucide-solid/icons/shield-alert'
import X from 'lucide-solid/icons/x'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Permission, usePermission} from '../primitives/permission.js'
import {ActionRow, ActionButton} from './action-row.js'

function Prompt(props: {label?: string}): JSX.Element {
  const permission = usePermission()
  return (
    <Show when={permission.pending()}>
      <div
        class="text-chat-text text-[length:var(--chat-text-md)] mb-1.5 mt-1 px-2.5 py-2 rounded-[var(--chat-radius-md)] flex flex-wrap gap-2 [background:var(--chat-fill)] [border:1px_solid_var(--chat-accent)] items-center"
        role="group"
        aria-label="Approve this action?"
      >
        <span class="text-chat-accent inline-flex" aria-hidden="true">
          <ShieldAlert size={14} />
        </span>
        <span class="flex-auto min-w-0">{props.label ?? 'Run this action?'}</span>
        <ActionRow>
          <ActionButton intent="deny" onClick={() => permission.reject()}>
            <X size={13} aria-hidden="true" />
            Deny
          </ActionButton>
          <ActionButton intent="allow" onClick={() => permission.approve()}>
            <Check size={13} aria-hidden="true" />
            Allow
          </ActionButton>
        </ActionRow>
      </div>
    </Show>
  )
}

export function PermissionCard(props: Pick<ToolCardProps, 'part' | 'ctx'> & {label?: string}): JSX.Element {
  return (
    <Permission.Root part={props.part} ctx={props.ctx}>
      <Prompt label={props.label} />
    </Permission.Root>
  )
}
