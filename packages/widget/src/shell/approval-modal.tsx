import {Show, type JSX} from 'solid-js'
import {Dialog} from '@mandarax/ui-kit-system'
import {PermissionCard} from '@mandarax/ui-kit-chat'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'

// A permission request awaiting the user's decision. ChatPanel derives one per `approval-requested`
// tool-call part and reports the part + the host ctx up; the modal renders the shared ui-kit-chat
// PermissionCard so the in-thread and out-of-thread (panel-closed) prompts are the same component.
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
