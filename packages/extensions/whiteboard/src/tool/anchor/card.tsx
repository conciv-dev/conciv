import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {InlineShell, parseInput, parseResultPayload, resultText, toolStatus} from '@conciv/ui-kit-chat/tools'

const InputSchema = z.object({cid: z.string()})
const OutputSchema = z.object({status: z.enum(['fresh', 'moved', 'drifted', 'orphaned', 'ambiguous'])})

const STATUS_TONE: Record<z.infer<typeof OutputSchema>['status'], string> = {
  fresh: 'text-chat-text-3',
  moved: 'text-chat-warn',
  drifted: 'text-chat-warn',
  orphaned: 'text-chat-danger',
  ambiguous: 'text-chat-warn',
}

function resolvedStatus(result: ToolResultPart | undefined): string | undefined {
  const parsed = OutputSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data.status : undefined
}

function anchorLabel(part: ToolCallPart, result: ToolResultPart | undefined): string {
  const cid = parseInput(InputSchema, part)?.cid ?? ''
  const resolved = resolvedStatus(result)
  return resolved === undefined ? cid : `${cid} · ${resolved}`
}

function anchorValue(part: ToolCallPart, result: ToolResultPart | undefined): string {
  if (toolStatus(part, result) === 'error') return resultText(result)
  return anchorLabel(part, result)
}

export function AnchorResolveCard(props: ToolCardProps): JSX.Element {
  const status = () => toolStatus(props.part, props.result)
  const output = () => {
    const parsed = OutputSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? parsed.data : undefined
  }
  const value = () => anchorValue(props.part, props.result)
  const tone = () => {
    const resolved = output()?.status
    return resolved ? STATUS_TONE[resolved] : 'text-chat-text-3'
  }
  return (
    <InlineShell name={props.part.name} status={status()}>
      <Show when={value()}>{(text) => <span class={`truncate ${tone()}`}>{text()}</span>}</Show>
    </InlineShell>
  )
}

export const anchorResolveCard: ToolCardView = {
  render: AnchorResolveCard,
  hasEmbeddedBody: (part, result) => anchorValue(part, result).length > 0,
}
