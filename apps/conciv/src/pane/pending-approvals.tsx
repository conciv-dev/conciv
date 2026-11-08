import {For, splitProps, type JSX} from 'solid-js'
import type {ToolCallPart} from '@conciv/protocol/chat-message-types'
import type {ApprovalAsk} from '@conciv/protocol/chat-event-types'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {TracePermissionBlock} from '@conciv/ui-kit-chat/tools'
import {TURN_MEASURE_CLASS} from '@conciv/ui-kit-chat'

const LIST = `relative flex flex-col gap-1.5 min-w-0 p-0 m-0 list-none self-stretch ${TURN_MEASURE_CLASS}`

function askPart(ask: ApprovalAsk): ToolCallPart {
  return {
    type: 'tool-call',
    id: ask.toolCallId,
    name: ask.toolName,
    arguments: JSON.stringify(ask.input ?? {}),
    state: 'approval-requested',
    approval: {id: ask.approvalId, needsApproval: true},
  }
}

export function PendingApprovals(props: {asks: ApprovalAsk[]; ctx: ToolViewCtx}): JSX.Element {
  const [local] = splitProps(props, ['asks', 'ctx'])
  return (
    <ul class={LIST} aria-label="Permission requests">
      <For each={local.asks}>
        {(ask) => {
          const part = askPart(ask)
          return (
            <TracePermissionBlock
              part={part}
              ctx={local.ctx}
              target={ask.toolName}
              explanation={local.ctx.catalog.meta(part.name)?.summary}
            />
          )
        }}
      </For>
    </ul>
  )
}
