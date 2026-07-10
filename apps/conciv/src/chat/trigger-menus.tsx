import {createMemo, For, Show, type Accessor, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {ComposerPrimitive, type DirectiveFormatter, type TriggerAdapter, type TriggerItem} from '@conciv/ui-kit-chat'
import type {ChatCommand, ChatTool} from '@conciv/protocol/chat-types'
import {useApp} from '../app/context.js'

const PANEL =
  'absolute bottom-full start-0 z-50 mb-2 w-72 overflow-hidden rounded-pw-md border border-pw-line bg-pw-panel shadow-lg flex flex-col font-pw'
const OPTION =
  'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-start [border:none] bg-transparent cursor-pointer text-pw-text data-[highlighted]:bg-pw-fill-strong'
const OPTION_LABEL = 'w-full truncate text-[0.8125rem] font-medium'
const OPTION_DESC = 'w-full line-clamp-2 text-[0.75rem] text-pw-text-3 leading-tight'
const GROUP_HEADER =
  'px-3 pt-2 pb-1 text-[0.6875rem] font-medium tracking-[0.06em] [text-transform:uppercase] text-pw-text-3'

const slashFormatter: DirectiveFormatter = {
  serialize: (item) => `/${item.id}`,
  parse: (text) => [{kind: 'text', text}],
}
const mentionFormatter: DirectiveFormatter = {
  serialize: (item) => `@${item.id}`,
  parse: (text) => [{kind: 'text', text}],
}

const SOURCE_LABEL: Record<ChatCommand['source'], string> = {harness: 'Commands', mcp: 'MCP', plugin: 'Plugins'}

function commandItem(command: ChatCommand): TriggerItem {
  return {
    id: command.name,
    type: 'command',
    label: `/${command.name}`,
    description: command.description,
    metadata: {
      group: SOURCE_LABEL[command.source],
      ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
    },
  }
}

function toolItem(tool: ChatTool): TriggerItem {
  return {
    id: tool.name,
    type: 'tool',
    label: `@${tool.name}`,
    description: tool.description,
    metadata: {group: tool.extension ?? 'Tools'},
  }
}

function matches(item: TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}

function groupedAdapter(items: Accessor<readonly TriggerItem[]>): TriggerAdapter {
  return {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => {
      const lower = query.toLowerCase()
      return items().filter((item) => matches(item, lower))
    },
  }
}

function groupOf(item: TriggerItem): string {
  const group = item.metadata?.group
  return typeof group === 'string' ? group : ''
}

function GroupedList(props: {items: readonly TriggerItem[]}): JSX.Element {
  return (
    <For each={props.items}>
      {(item, index) => (
        <>
          <Show when={index() === 0 || groupOf(item) !== groupOf(props.items[index() - 1] ?? item)}>
            <div class={GROUP_HEADER}>{groupOf(item)}</div>
          </Show>
          <ComposerPrimitive.TriggerPopoverItem item={item} index={index()} class={OPTION}>
            <span class={OPTION_LABEL}>{item.label}</span>
            <Show when={item.description}>
              <span class={OPTION_DESC}>{item.description}</span>
            </Show>
          </ComposerPrimitive.TriggerPopoverItem>
        </>
      )}
    </For>
  )
}

function TriggerMenu(props: {
  char: string
  formatter: DirectiveFormatter
  items: Accessor<readonly TriggerItem[]>
}): JSX.Element {
  return (
    <Show when={props.items().length > 0}>
      <ComposerPrimitive.TriggerPopover char={props.char} adapter={groupedAdapter(props.items)} class={PANEL}>
        <ComposerPrimitive.TriggerPopover.Directive formatter={props.formatter} />
        <ComposerPrimitive.TriggerPopoverItems class="max-h-64 overflow-y-auto overscroll-contain py-1 flex flex-col">
          {(items) => <GroupedList items={items()} />}
        </ComposerPrimitive.TriggerPopoverItems>
      </ComposerPrimitive.TriggerPopover>
    </Show>
  )
}

function sortByGroup(items: readonly TriggerItem[]): readonly TriggerItem[] {
  return items.toSorted((a, b) => groupOf(a).localeCompare(groupOf(b)))
}

export function TriggerMenus(props: {sessionId: string}): JSX.Element {
  const app = useApp()
  const commands = useQuery(() => app.data.utils.meta.commands.queryOptions({input: {sessionId: props.sessionId}}))
  const tools = useQuery(() => app.data.utils.meta.tools.queryOptions())
  const commandItems = createMemo(() => sortByGroup((commands.data?.commands ?? []).map(commandItem)))
  const toolItems = createMemo(() => sortByGroup((tools.data?.tools ?? []).map(toolItem)))
  return (
    <>
      <TriggerMenu char="/" formatter={slashFormatter} items={commandItems} />
      <TriggerMenu char="@" formatter={mentionFormatter} items={toolItems} />
    </>
  )
}
