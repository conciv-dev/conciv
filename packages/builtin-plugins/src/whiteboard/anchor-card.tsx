import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {InlineShell, parseInput, parseResultPayload, resultText, toolStatus} from '@conciv/ui-kit-chat/tools'

const InputSchema = z.object({cid: z.string()})
const AnchorStatus = z.enum(['fresh', 'moved', 'drifted', 'orphaned', 'ambiguous'])
const OutputSchema = z.object({status: AnchorStatus}).loose()

const STATUS_TONE: Record<z.infer<typeof AnchorStatus>, string> = {
  fresh: 'text-chat-text-3',
  moved: 'text-chat-warn',
  drifted: 'text-chat-warn',
  orphaned: 'text-chat-danger',
  ambiguous: 'text-chat-warn',
}

function readStatus(result: ToolCardProps['result']): z.infer<typeof AnchorStatus> | undefined {
  const parsed = OutputSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data.status : undefined
}

function anchorValue(part: ToolCardProps['part'], result: ToolCardProps['result']): string {
  if (result?.state === 'error') return result.error ?? resultText(result)
  const cid = parseInput(InputSchema, part)?.cid ?? ''
  const resolved = readStatus(result)
  return resolved === undefined ? cid : `${cid} · ${resolved}`
}

function AnchorResolveCard(props: ToolCardProps): JSX.Element {
  const value = () => anchorValue(props.part, props.result)
  const tone = () => {
    const resolved = readStatus(props.result)
    return resolved ? STATUS_TONE[resolved] : 'text-chat-text-3'
  }
  return (
    <InlineShell name={props.part.name} status={toolStatus(props.part, props.result)}>
      <Show when={value()}>{(text) => <span class={`truncate ${tone()}`}>{text()}</span>}</Show>
    </InlineShell>
  )
}

export const anchorCard: ToolCardView = {
  render: AnchorResolveCard,
  hasEmbeddedBody: (part, result) => anchorValue(part, result).length > 0,
}
