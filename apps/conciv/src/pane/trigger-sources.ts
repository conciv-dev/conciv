import {useFilter} from '@ark-ui/solid/locale'
import type {ChatCommand, ChatTool} from '@conciv/protocol/chat-types'
import type {RichTextFieldTriggerItem} from '@conciv/ui-kit-tap'
import {useAppData, useAppQueryClient} from '../app/context.js'
import type {ComposerTriggerSources} from './composer-input-adapter.js'

const SOURCE_LABEL: Record<ChatCommand['source'], string> = {harness: 'Commands', mcp: 'MCP', plugin: 'Plugins'}

function commandEntry(command: ChatCommand): RichTextFieldTriggerItem {
  return {
    id: command.name,
    label: `/${command.name}`,
    group: SOURCE_LABEL[command.source],
    description: command.description,
  }
}

function toolEntry(tool: ChatTool): RichTextFieldTriggerItem {
  return {id: tool.name, label: `@${tool.name}`, group: tool.extension ?? 'Tools', description: tool.description}
}

const groupOf = (entry: RichTextFieldTriggerItem): string => entry.group ?? ''

function matchingItems(
  entries: RichTextFieldTriggerItem[],
  query: string,
  contains: (text: string, query: string) => boolean,
): RichTextFieldTriggerItem[] {
  return entries
    .filter(
      (entry) => contains(entry.id, query) || contains(entry.label, query) || contains(entry.description ?? '', query),
    )
    .toSorted((first, second) => groupOf(first).localeCompare(groupOf(second)))
}

export function useComposerTriggerSources(sessionId: string): ComposerTriggerSources {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const filter = useFilter({sensitivity: 'base'})
  return {
    slash: {
      label: 'Commands',
      items: async (query) => {
        const data = await queryClient.ensureQueryData(appData.utils.meta.commands.queryOptions({input: {sessionId}}))
        return matchingItems(data.commands.map(commandEntry), query, filter().contains)
      },
    },
    mention: {
      label: 'Tools',
      items: async (query) => {
        const data = await queryClient.ensureQueryData(appData.utils.meta.tools.queryOptions())
        return matchingItems(data.tools.map(toolEntry), query, filter().contains)
      },
    },
  }
}
