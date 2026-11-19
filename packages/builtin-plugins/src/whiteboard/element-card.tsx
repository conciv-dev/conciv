import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {BasicTool} from '@conciv/ui-kit-chat/tools'
import {parseOutput, readInput} from '../page/cards/shared.js'

const InputSchema = z.object({file: z.string(), component: z.string()})
const OutputSchema = z.object({found: z.boolean()}).loose()

function readFound(output: string | undefined): boolean | undefined {
  return readInput(OutputSchema, parseOutput(output))?.found
}

function elementValue(input: ToolProps['input'], output: string | undefined): string {
  const component = readInput(InputSchema, input)?.component ?? ''
  if (component === '') return ''
  return readFound(output) === false ? `${component} not found` : component
}

function ElementReferenceCard(props: ToolProps): JSX.Element {
  const missing = () => readFound(props.output) === false
  return (
    <BasicTool
      {...props}
      status={missing() ? 'error' : props.status}
      trigger={{
        title: props.tool,
        subtitle: elementValue(props.input, props.output) || undefined,
        subtitleClass: missing() ? 'text-chat-danger' : 'text-chat-text-3',
      }}
      hasContent={false}
    />
  )
}

export const elementCard: ToolComponent = ElementReferenceCard
