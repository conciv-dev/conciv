import {Show, type JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, ToolCard, parseInput} from '@conciv/ui-kit-chat/tools'
const LookupInput = z.object({query: z.string().optional()})

function Icon(): JSX.Element {
  return <Wrench size={14} />
}

export function ToolLookupCard(props: ToolCardProps): JSX.Element {
  const query = () => parseInput(LookupInput, props.part)?.query
  return (
    <ToolCard Icon={Icon} title="Loaded tools" part={props.part} result={props.result}>
      <Show when={query()}>{(value) => <Chip kind="pill" value={value()} />}</Show>
    </ToolCard>
  )
}

export const toolLookupTool: ToolCardEntry = {names: ['ToolSearch'], render: ToolLookupCard}
