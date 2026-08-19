import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
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

export function AnchorResolveCard(props: ToolCardProps): JSX.Element {
  const status = () => toolStatus(props.part, props.result)
  const cid = () => parseInput(InputSchema, props.part)?.cid ?? ''
  const output = () => {
    const parsed = OutputSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? parsed.data : undefined
  }
  const value = () => {
    if (status() === 'error') return resultText(props.result)
    const resolved = output()?.status
    return resolved ? `${cid()} · ${resolved}` : cid()
  }
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
