import {Show, type JSX} from 'solid-js'
import {Dialog} from '@conciv/ui-kit-system'
import {PermissionCard} from '@conciv/ui-kit-chat'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'

export type PendingApproval = {id: string; part: ToolCallPart; ctx: ToolViewCtx; label?: string}

export function ApprovalModal(props: {visible: () => boolean; approvals: () => PendingApproval[]}): JSX.Element {
  const current = () => props.approvals()[0]
  return (
    <Dialog open={props.visible() && !!current()} label="Approve this action?">
      <Show when={current()}>
        {(a) => <PermissionCard part={a().part} result={undefined} ctx={a().ctx} label={a().label} />}
      </Show>
    </Dialog>
  )
}
