import {useFilter} from '@ark-ui/solid/locale'
import {uniqBy} from 'es-toolkit'
import type {ChatCommand, ChatTool} from '@conciv/protocol/chat-types'
import type {ExtensionCommand} from '@conciv/extension'
import type {RichTextFieldTriggerItem} from '@conciv/ui-kit-tap'
import {useAppData, useAppQueryClient, useInstances} from '../app/context.js'
import type {ComposerTriggerSources} from './composer-input-adapter.js'

export type PaneCommandProps = {sessionId: string; openModelMenu: () => void}

export type PaneCommandSources = {triggers: ComposerTriggerSources; runTyped: (text: string) => boolean}

const SOURCE_LABEL: Record<ChatCommand['source'], string> = {harness: 'Commands', mcp: 'MCP', plugin: 'Plugins'}

function commandEntry(command: ChatCommand): RichTextFieldTriggerItem {
  return {
    id: command.name,
    label: `/${command.name}`,
    group: SOURCE_LABEL[command.source],
    description: command.description,
  }
}

function builtinCommands(props: PaneCommandProps): ExtensionCommand[] {
  return [{name: 'model', description: 'Switch the model', run: () => props.openModelMenu()}]
}

function widgetCommandEntry(command: ExtensionCommand, props: PaneCommandProps): RichTextFieldTriggerItem {
  return {
    id: command.name,
    label: `/${command.name}`,
    group: SOURCE_LABEL.harness,
    description: command.description,
    run: () => command.run({sessionId: props.sessionId}),
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

export function useComposerTriggerSources(props: PaneCommandProps): PaneCommandSources {
  const extensionCommands = useInstances().flatMap((instance) => instance.extension.commands ?? [])
  const widgetCommands = uniqBy([...builtinCommands(props), ...extensionCommands], (command) => command.name)
  const widgetNames = new Set(widgetCommands.map((command) => command.name))
  const widgetEntries = widgetCommands.map((command) => widgetCommandEntry(command, props))
  const runTyped = (text: string): boolean => {
    const command = widgetCommands.find((candidate) => `/${candidate.name}` === text.trim())
    if (!command) return false
    command.run({sessionId: props.sessionId})
    return true
  }
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const filter = useFilter({sensitivity: 'base'})
  const matcher = (): Matcher => ({
    equals: (text, query) => filter().startsWith(text, query) && filter().startsWith(query, text),
    startsWith: filter().startsWith,
    contains: filter().contains,
  })
  const triggers: ComposerTriggerSources = {
    slash: {
      label: 'Commands',
      items: async (query) => {
        const harnessCommands = await queryClient
          .ensureQueryData(appData.utils.meta.commands.queryOptions({input: {sessionId: props.sessionId}}))
          .then((data) => data.commands)
          .catch(() => [])
        const harnessEntries = harnessCommands.filter((command) => !widgetNames.has(command.name)).map(commandEntry)
        return matchingItems([...widgetEntries, ...harnessEntries], query, matcher())
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
  return {triggers, runTyped}
}
