import {For, Show, type JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, parseResultPayload, ToolCard} from '@conciv/ui-kit-chat/tools'
import {schemaParams} from '@conciv/ui-kit-chat/tools'
import {truncate} from '../../primitives/tools/inline-tool.js'

const LoadedTool = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.unknown().optional(),
})
const Output = z.object({tools: z.array(LoadedTool)})

type LoadedToolValue = z.infer<typeof LoadedTool>

function parseOutput(result: ToolCardProps['result']): z.infer<typeof Output> | null {
  const parsed = Output.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function Icon(): JSX.Element {
  return <Wrench size={14} />
}

function tip(description: string | undefined, params: string): string | undefined {
  if (!description) return params || undefined
  if (!params) return description
  return `${description} · ${params}`
}

function ChipCloud(props: {tools: LoadedToolValue[]}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={props.tools}>
        {(tool) => (
          <Chip
            kind="pill"
            tone="accent"
            value={tool.name}
            tooltip={tip(tool.description, schemaParams(tool.inputSchema))}
          />
        )}
      </For>
    </div>
  )
}

export function LoadedToolsCard(props: ToolCardProps): JSX.Element {
  const tools = (): LoadedToolValue[] => parseOutput(props.result)?.tools ?? []
  const title = (): string => `Loaded ${tools().length} tool${tools().length === 1 ? '' : 's'}`
  const summary = (): string =>
    truncate(
      tools()
        .map((tool) => tool.name)
        .join(', '),
      40,
    )
  return (
    <ToolCard Icon={Icon} title={title()} meta={summary()} part={props.part} result={props.result}>
      <div class="flex flex-col gap-3 min-w-0">
        <ChipCloud tools={tools()} />
        <Show when={tools().length === 0}>
          <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no tools loaded</span>
        </Show>
      </div>
    </ToolCard>
  )
}

export const loadedToolsTool: ToolCardEntry = {names: ['__lazy__tool__discovery__'], render: LoadedToolsCard}
