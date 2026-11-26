import {createMemo, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolRegistry} from '@conciv/frontend-plugin-api'
import type {ToolCallPart, ToolResultPart} from '@conciv/types/chat-message-types'
import {toolCallDuration} from '@conciv/types/chat-event-types'
import type {ToolViewCtx} from '@conciv/types/tool-view-types'
import type {ToolCardEntry} from '../tools/primitives/define-toolkit.js'
import {findToolEntry} from '../tools/primitives/define-toolkit.js'
import {toolStatus, type ToolStatus} from '../tools/primitives/tool-status.js'
import {parseInput, resultText} from '../tools/primitives/tool-util.js'
import {ToolDisplay} from '../tools/styled/tool-display.js'
import {outsideTag, ToolCallCard, ToolTraceRow} from '../tools/styled/tool-call-card.js'
import {ROW_ITEM} from './trace/trace-row.js'

export type ToolRender = (name: string) => Pick<ToolRegistry, 'render' | 'errorComponent'> | undefined

export type ToolDisclosure = {
  open: (partId: string) => boolean | undefined
  setOpen: (partId: string, open: boolean) => void
}

const STATUS: Record<ToolStatus, string> = {
  running: 'running',
  approval: 'pending',
  complete: 'completed',
  error: 'error',
  denied: 'denied',
  cancelled: 'cancelled',
}

const ToolInputSchema = z.record(z.string(), z.unknown())

const ToolMetadataSchema = z.record(z.string(), z.unknown()).catch({})

function toolOutput(part: ToolCallPart, result: ToolResultPart | undefined): string | undefined {
  if (result !== undefined) return resultText(result)
  if (part.output === undefined) return undefined
  return typeof part.output === 'string' ? part.output : JSON.stringify(part.output, null, 2)
}

export function ToolPartRow(props: {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  entries: readonly ToolCardEntry[]
  render: ToolRender | undefined
  renderPending: boolean
  disclosure: ToolDisclosure
  sessionID?: string
  ring?: boolean
  chain: boolean
}): JSX.Element {
  const status = () => STATUS[toolStatus(props.part, props.result)]
  const registered = createMemo(() => props.render?.(props.part.name)?.render !== undefined)
  const entry = createMemo(() =>
    status() === 'error' || registered() ? undefined : findToolEntry(props.entries, props.part),
  )
  const startsOpen = () => status() !== 'error' && registered()
  const settled = () => status() !== 'running' && status() !== 'pending'
  const output = () => (settled() ? toolOutput(props.part, props.result) : undefined)
  const input = createMemo(() => parseInput(ToolInputSchema, props.part) ?? {})
  const metadata = createMemo(() => ToolMetadataSchema.parse(props.part.metadata ?? {}))
  const durationMs = () => toolCallDuration(props.part)
  const display = (): JSX.Element => (
    <ToolDisplay
      id={props.part.id}
      tool={props.part.name}
      input={input()}
      metadata={metadata()}
      output={output()}
      error={status() === 'error' ? props.result?.error || output() : undefined}
      tag={outsideTag(props.part)}
      status={status()}
      sessionID={props.sessionID}
      defaultOpen={startsOpen()}
      open={props.disclosure.open(props.part.id) ?? startsOpen()}
      onOpenChange={(open) => props.disclosure.setOpen(props.part.id, open)}
      render={props.render}
      renderPending={props.renderPending}
      durationMs={durationMs()}
    />
  )
  const legacy = (): JSX.Element =>
    props.chain ? (
      <ToolTraceRow
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={durationMs()}
        tools={() => [...props.entries]}
        ring={props.ring}
      />
    ) : (
      <ToolCallCard
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={durationMs()}
        tools={() => [...props.entries]}
      />
    )
  return (
    <Show when={entry() === undefined} fallback={legacy()}>
      <Show when={props.chain} fallback={display()}>
        <li class={ROW_ITEM} data-trace-live={props.ring ? '' : undefined}>
          {display()}
        </li>
      </Show>
    </Show>
  )
}
