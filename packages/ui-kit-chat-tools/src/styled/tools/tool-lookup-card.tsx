import {Show, type JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {ToolCard, parseInput} from '@conciv/ui-kit-chat'

const LookupInput = z.object({query: z.string().optional()})

function Icon(): JSX.Element {
  return <Wrench size={14} />
}

export function ToolLookupCard(props: ToolCardProps): JSX.Element {
  const query = () => parseInput(LookupInput, props.part)?.query
  return (
    <ToolCard Icon={Icon} title="Loaded tools" part={props.part} result={props.result}>
      <Show when={query()}>
        <code class="text-[length:var(--chat-text-xs)] px-2 py-0.5 rounded-[var(--chat-radius-sm)] inline-flex max-w-full min-w-0 whitespace-nowrap text-ellipsis [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)] overflow-hidden">
          {query()}
        </code>
      </Show>
    </ToolCard>
  )
}

export const toolLookupTool: ToolCardEntry = {names: ['ToolSearch'], render: ToolLookupCard}
