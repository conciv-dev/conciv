import {For, Show, type JSX} from 'solid-js'
import {Search} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Markdown, parseResultPayload, ToolCard} from '@conciv/ui-kit-chat'
import {ToolChip} from './tool-chip.js'

const DiscoveredTool = z.object({name: z.string(), description: z.string(), typeStub: z.string()})
const Output = z.object({tools: z.array(DiscoveredTool), errors: z.array(z.string()).optional()})

type DiscoveredToolValue = z.infer<typeof DiscoveredTool>

function parseOutput(result: ToolCardProps['result']): z.infer<typeof Output> | null {
  const parsed = Output.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function Icon(): JSX.Element {
  return <Search size={14} />
}

function ChipCloud(props: {tools: DiscoveredToolValue[]; errors: string[]}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={props.tools}>{(tool) => <ToolChip name={tool.name} tone="new" tip={tool.description} />}</For>
      <For each={props.errors}>{(error) => <ToolChip name={error} tone="bad" tip={error} />}</For>
    </div>
  )
}

function ApiStub(props: {tool: DiscoveredToolValue}): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5 min-w-0">
      <span class="text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)]">{props.tool.description}</span>
      <Markdown content={`\`\`\`ts\n${props.tool.typeStub}\n\`\`\``} />
    </div>
  )
}

export function DiscoveredApisCard(props: ToolCardProps): JSX.Element {
  const output = (): z.infer<typeof Output> | null => parseOutput(props.result)
  const tools = (): DiscoveredToolValue[] => output()?.tools ?? []
  const errors = (): string[] => output()?.errors ?? []
  const title = (): string => `Discovered ${tools().length} API${tools().length === 1 ? '' : 's'}`
  return (
    <ToolCard Icon={Icon} title={title()} part={props.part} result={props.result}>
      <div class="flex flex-col gap-3 min-w-0">
        <ChipCloud tools={tools()} errors={errors()} />
        <For each={tools()}>{(tool) => <ApiStub tool={tool} />}</For>
        <Show when={tools().length === 0 && errors().length === 0}>
          <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no APIs returned</span>
        </Show>
      </div>
    </ToolCard>
  )
}

export const discoveredApisTool: ToolCardEntry = {names: ['discover_tools'], render: DiscoveredApisCard}
