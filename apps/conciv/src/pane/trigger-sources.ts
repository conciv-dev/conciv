import type {ChatCommand, ChatTool} from '@conciv/protocol/chat-types'
import type {RichTextFieldTriggerItem} from '@conciv/ui-kit-tap'
import {useAppData, useAppQueryClient} from '../app/context.js'
import type {ComposerTriggerSources} from './composer-input-adapter.js'

const SOURCE_LABEL: Record<ChatCommand['source'], string> = {harness: 'Commands', mcp: 'MCP', plugin: 'Plugins'}

type TriggerEntry = RichTextFieldTriggerItem & {group: string; description: string}

function commandEntry(command: ChatCommand): TriggerEntry {
  return {
    id: command.name,
    label: `/${command.name}`,
    group: SOURCE_LABEL[command.source],
    description: command.description,
  }
}

function toolEntry(tool: ChatTool): TriggerEntry {
  return {id: tool.name, label: `@${tool.name}`, group: tool.extension ?? 'Tools', description: tool.description}
}

function matchingItems(entries: TriggerEntry[], query: string): RichTextFieldTriggerItem[] {
  const lower = query.toLowerCase()
  return entries
    .filter(
      (entry) =>
        entry.id.toLowerCase().includes(lower) ||
        entry.label.toLowerCase().includes(lower) ||
        entry.description.toLowerCase().includes(lower),
    )
    .toSorted((first, second) => first.group.localeCompare(second.group))
    .map((entry) => ({id: entry.id, label: entry.label}))
}

export function useComposerTriggerSources(sessionId: string): ComposerTriggerSources {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  return {
    slash: {
      label: 'Commands',
      items: async (query) => {
        const data = await queryClient.ensureQueryData(appData.utils.meta.commands.queryOptions({input: {sessionId}}))
        return matchingItems(data.commands.map(commandEntry), query)
      },
    },
    mention: {
      label: 'Tools',
      items: async (query) => {
        const data = await queryClient.ensureQueryData(appData.utils.meta.tools.queryOptions())
        return matchingItems(data.tools.map(toolEntry), query)
      },
    },
  }
}
