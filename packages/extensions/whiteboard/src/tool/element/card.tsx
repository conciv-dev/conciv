import {Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {InlineShell, parseInput, parseResultPayload, toolStatus} from '@conciv/ui-kit-chat/tools'

const InputSchema = z.object({file: z.string(), component: z.string()})
const OutputSchema = z.object({found: z.boolean()}).loose()

function locationOf(component: string, found: boolean): string {
  return found ? component : `${component} not found`
}

export function ElementReferenceCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(InputSchema, props.part)
  const output = () => {
    const parsed = OutputSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? parsed.data : undefined
  }
  const component = () => input()?.component ?? ''
  const found = () => output()?.found
  const missing = () => found() === false
  const status = () => (missing() ? 'error' : toolStatus(props.part, props.result))
  const value = () => (component() === '' ? '' : locationOf(component(), !missing()))
  const tone = () => (missing() ? 'text-chat-danger' : 'text-chat-text-3')
  return (
    <InlineShell name={props.part.name} status={status()}>
      <Show when={value()}>{(text) => <span class={`truncate ${tone()}`}>{text()}</span>}</Show>
    </InlineShell>
  )
}
