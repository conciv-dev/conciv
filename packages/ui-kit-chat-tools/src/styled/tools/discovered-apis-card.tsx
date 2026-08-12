import {For, Show, type JSX} from 'solid-js'
import Search from 'lucide-solid/icons/search'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Markdown} from '@conciv/ui-kit-chat'
import {Chip, parseResultPayload, ToolCard} from '@conciv/ui-kit-chat/tools'

const CatalogEntry = z.object({call: z.string(), name: z.string(), summary: z.string()})
const CatalogList = z.object({tools: z.array(CatalogEntry)})
const CatalogDetail = z.object({call: z.string(), name: z.string(), description: z.string(), typeStub: z.string()})

type CatalogEntryValue = z.infer<typeof CatalogEntry>
type CatalogDetailValue = z.infer<typeof CatalogDetail>

function parseList(result: ToolCardProps['result']): z.infer<typeof CatalogList> | null {
  const parsed = CatalogList.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function parseDetail(result: ToolCardProps['result']): CatalogDetailValue | null {
  const parsed = CatalogDetail.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function Icon(): JSX.Element {
  return <Search size={14} />
}

function ChipCloud(props: {tools: CatalogEntryValue[]}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={props.tools}>
        {(tool) => <Chip kind="pill" tone="accent" value={tool.name} tooltip={tool.summary} />}
      </For>
    </div>
  )
}

function ApiStub(props: {detail: CatalogDetailValue}): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5 min-w-0">
      <span class="text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)]">{props.detail.description}</span>
      <Markdown content={`\`\`\`ts\n${props.detail.typeStub}\n\`\`\``} />
    </div>
  )
}

function ListCard(props: {
  list: z.infer<typeof CatalogList>
  part: ToolCardProps['part']
  result: ToolCardProps['result']
}): JSX.Element {
  const tools = () => props.list.tools
  const title = (): string => `Discovered ${tools().length} capabilit${tools().length === 1 ? 'y' : 'ies'}`
  return (
    <ToolCard Icon={Icon} title={title()} part={props.part} result={props.result}>
      <div class="flex flex-col gap-3 min-w-0">
        <ChipCloud tools={tools()} />
        <Show when={tools().length === 0}>
          <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no APIs returned</span>
        </Show>
      </div>
    </ToolCard>
  )
}

function DetailCard(props: {
  detail: CatalogDetailValue
  part: ToolCardProps['part']
  result: ToolCardProps['result']
}): JSX.Element {
  return (
    <ToolCard Icon={Icon} title={`Inspected ${props.detail.name}`} part={props.part} result={props.result}>
      <ApiStub detail={props.detail} />
    </ToolCard>
  )
}

function ShellCard(props: {part: ToolCardProps['part']; result: ToolCardProps['result']}): JSX.Element {
  return (
    <ToolCard Icon={Icon} title="Capability catalog" part={props.part} result={props.result}>
      <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no APIs returned</span>
    </ToolCard>
  )
}

export function DiscoveredApisCard(props: ToolCardProps): JSX.Element {
  const list = () => parseList(props.result)
  const detail = () => parseDetail(props.result)
  return (
    <Show
      when={list()}
      fallback={
        <Show when={detail()} fallback={<ShellCard part={props.part} result={props.result} />}>
          {(value) => <DetailCard detail={value()} part={props.part} result={props.result} />}
        </Show>
      }
    >
      {(value) => <ListCard list={value()} part={props.part} result={props.result} />}
    </Show>
  )
}

export const discoveredApisTool: ToolCardEntry = {names: ['catalog'], render: DiscoveredApisCard}
