import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {InlineShell, parseInput, parseResultPayload, toolStatus} from '@conciv/ui-kit-chat/tools'

const InputSchema = z.object({file: z.string(), component: z.string()})
const OutputSchema = z.object({found: z.boolean()}).loose()

function locationOf(component: string, found: boolean): string {
  return found ? component : `${component} not found`
}

function foundFlag(result: ToolResultPart | undefined): boolean | undefined {
  const parsed = OutputSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data.found : undefined
}

function elementValue(part: ToolCallPart, result: ToolResultPart | undefined): string {
  const component = parseInput(InputSchema, part)?.component ?? ''
  if (component === '') return ''
  return locationOf(component, foundFlag(result) !== false)
}

export function ElementReferenceCard(props: ToolCardProps): JSX.Element {
  const output = () => {
    const parsed = OutputSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? parsed.data : undefined
  }
  const found = () => output()?.found
  const missing = () => found() === false
  const status = () => (missing() ? 'error' : toolStatus(props.part, props.result))
  const value = () => elementValue(props.part, props.result)
  const tone = () => (missing() ? 'text-chat-danger' : 'text-chat-text-3')
  return (
    <InlineShell name={props.part.name} status={status()}>
      <Show when={value()}>{(text) => <span class={`truncate ${tone()}`}>{text()}</span>}</Show>
    </InlineShell>
  )
}

export const elementReferenceCard: ToolCardView = {
  render: ElementReferenceCard,
  hasEmbeddedBody: (part, result) => elementValue(part, result).length > 0,
}
