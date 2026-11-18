import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {InlineShell, parseInput, parseResultPayload, toolStatus} from '@conciv/ui-kit-chat/tools'

const InputSchema = z.object({file: z.string(), component: z.string()})
const OutputSchema = z.object({found: z.boolean()}).loose()

function readFound(result: ToolCardProps['result']): boolean | undefined {
  const parsed = OutputSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data.found : undefined
}

function elementValue(part: ToolCardProps['part'], result: ToolCardProps['result']): string {
  const component = parseInput(InputSchema, part)?.component ?? ''
  if (component === '') return ''
  return readFound(result) === false ? `${component} not found` : component
}

function ElementReferenceCard(props: ToolCardProps): JSX.Element {
  const missing = () => readFound(props.result) === false
  const status = () => (missing() ? 'error' : toolStatus(props.part, props.result))
  const value = () => elementValue(props.part, props.result)
  return (
    <InlineShell name={props.part.name} status={status()}>
      <Show when={value()}>
        {(text) => <span class={`truncate ${missing() ? 'text-chat-danger' : 'text-chat-text-3'}`}>{text()}</span>}
      </Show>
    </InlineShell>
  )
}

export const elementCard: ToolCardView = {
  render: ElementReferenceCard,
  hasEmbeddedBody: (part, result) => elementValue(part, result).length > 0,
}
