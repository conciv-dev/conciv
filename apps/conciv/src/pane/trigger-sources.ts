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

type TextMatch = (text: string, query: string) => boolean

type Matcher = {equals: TextMatch; startsWith: TextMatch; contains: TextMatch}

const UNMATCHED = 4

function rankOf(entry: RichTextFieldTriggerItem, query: string, match: Matcher): number {
  if (match.equals(entry.id, query)) return 0
  if (match.startsWith(entry.id, query)) return 1
  if (match.contains(entry.id, query)) return 2
  if (match.contains(entry.description ?? '', query)) return 3
  return UNMATCHED
}

function matchingItems(entries: RichTextFieldTriggerItem[], query: string, match: Matcher): RichTextFieldTriggerItem[] {
  return entries
    .map((entry) => ({entry, rank: rankOf(entry, query, match)}))
    .filter((ranked) => ranked.rank < UNMATCHED)
    .toSorted((first, second) => first.rank - second.rank || groupOf(first.entry).localeCompare(groupOf(second.entry)))
    .map((ranked) => ranked.entry)
}

export function useComposerTriggerSources(sessionId: string): ComposerTriggerSources {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const filter = useFilter({sensitivity: 'base'})
  const matcher = (): Matcher => ({
    equals: (text, query) => filter().startsWith(text, query) && filter().startsWith(query, text),
    startsWith: filter().startsWith,
    contains: filter().contains,
  })
  return {
    slash: {
      label: 'Commands',
      items: async (query) => {
        const data = await queryClient.ensureQueryData(appData.utils.meta.commands.queryOptions({input: {sessionId}}))
        return matchingItems(data.commands.map(commandEntry), query, matcher())
      },
    },
    mention: {
      label: 'Tools',
      items: async (query) => {
        const data = await queryClient.ensureQueryData(appData.utils.meta.tools.queryOptions())
        return matchingItems(data.tools.map(toolEntry), query, matcher())
      },
    },
  }
}
