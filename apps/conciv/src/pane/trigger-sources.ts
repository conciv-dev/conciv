import {createMemo} from 'solid-js'
import {useFilter} from '@ark-ui/solid/locale'
import {uniqBy} from 'es-toolkit'
import BookOpen from 'lucide-solid/icons/book-open'
import Brain from 'lucide-solid/icons/brain'
import {Command} from '@conciv/plugin/experimental'
import type {ChatCommand, ChatTool} from '@conciv/protocol/chat-types'
import type {RpcClient} from '@conciv/contract'
import type {InferClientOutputs} from '@orpc/client'
import type {RichTextFieldTriggerItem} from '@conciv/ui-kit-tap'
import {useAppData, useAppQueryClient, useInstances} from '../app/context.js'
import type {ExtensionInstance} from '../extension/extension-slots.js'
import {usePluginHost, type Item} from '../runtime/plugin/host'
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

type WidgetCommand = {
  name: string
  description?: string
  arguments?: true
  after?: string
  run: (input?: string) => void
}

function guardedRun(owner: string, run: () => unknown): void {
  void Promise.try(run).catch((cause: unknown) => console.error(owner, cause))
}

function builtinCommands(props: PaneCommandProps): WidgetCommand[] {
  return [{name: 'model', description: 'Switch the model', run: () => props.openModelMenu()}]
}

function extensionCommands(instances: ExtensionInstance[], props: PaneCommandProps): WidgetCommand[] {
  return instances.flatMap((instance) =>
    (instance.extension.commands ?? []).map((command) => ({
      name: command.name,
      description: command.description,
      run: () => guardedRun(`[extension] ${instance.extension.name}`, () => command.run({sessionId: props.sessionId})),
    })),
  )
}

function pluginCommand(item: Item<Command>): WidgetCommand[] {
  const slash = item.value.slash
  if (!slash || item.value.enabled === false) return []
  return [
    {
      name: slash.name,
      description: item.value.description,
      arguments: slash.arguments,
      after: slash.after,
      run: (input) => guardedRun(`[plugin] ${item.plugin}`, () => item.value.run(input)),
    },
  ]
}

function placeAfterSlash(commands: WidgetCommand[]): WidgetCommand[] {
  const anchorFor = (command: WidgetCommand) => commands.find((anchor) => anchor.name === command.after)
  const reachesRoot = (command: WidgetCommand, steps: number): boolean => {
    const anchor = anchorFor(command)
    if (!anchor) return true
    return steps > 0 && reachesRoot(anchor, steps - 1)
  }
  const follows = (command: WidgetCommand) => anchorFor(command) !== undefined && reachesRoot(command, commands.length)
  const place = (command: WidgetCommand): WidgetCommand[] => [
    command,
    ...commands.filter((follower) => follower.after === command.name && follows(follower)).flatMap(place),
  ]
  return commands.filter((command) => !follows(command)).flatMap(place)
}

function findWidgetCommand(commands: WidgetCommand[], name: string): WidgetCommand | undefined {
  return commands.find((command) => command.name === name)
}

function widgetCommandEntry(command: WidgetCommand): RichTextFieldTriggerItem {
  return {
    id: command.name,
    label: `/${command.name}`,
    group: SOURCE_LABEL.harness,
    description: command.description,
    run: command.arguments ? undefined : () => command.run(),
  }
}

function parseTyped(text: string): {name: string; input?: string} | undefined {
  const typed = text.trim()
  if (!typed.startsWith('/')) return undefined
  const separator = typed.search(/\s/)
  if (separator === -1) return {name: typed.slice(1)}
  return {name: typed.slice(1, separator), input: typed.slice(separator).trim()}
}

type RpcOutputs = InferClientOutputs<RpcClient>

const SKILL_ICON: RichTextFieldTriggerItem['icon'] = {component: BookOpen, name: 'Skill'}

const AGENT_ICON: RichTextFieldTriggerItem['icon'] = {component: Brain, name: 'Agent', tone: 'chat-agent'}

function skillEntry(skill: RpcOutputs['skill']['list']['data'][number]): RichTextFieldTriggerItem {
  return {id: skill.id, label: `@${skill.id}`, description: skill.description, icon: SKILL_ICON}
}

function agentEntries(agents: RpcOutputs['agent']['list']['data']): RichTextFieldTriggerItem[] {
  return agents
    .filter((agent) => agent.mode !== 'primary' && !agent.hidden)
    .map((agent) => ({id: agent.name, label: `@${agent.name}`, icon: AGENT_ICON}))
}

function toolEntry(tool: ChatTool): RichTextFieldTriggerItem {
  return {id: tool.name, label: `@${tool.name}`, group: tool.extension ?? 'Tools', description: tool.description}
}

function settledEntries<Value>(
  result: PromiseSettledResult<Value>,
  catalog: string,
  toEntries: (value: Value) => RichTextFieldTriggerItem[],
): RichTextFieldTriggerItem[] {
  if (result.status === 'fulfilled') return toEntries(result.value)
  console.error(`[conciv] the @ list could not read ${catalog}`, result.reason)
  return []
}

const readGroup = (entry: RichTextFieldTriggerItem): string => entry.group ?? ''

type TextMatch = (text: string, query: string) => boolean

type Matcher = {equals: TextMatch; startsWith: TextMatch; contains: TextMatch}

const UNMATCHED = 4

function computeRank(entry: RichTextFieldTriggerItem, query: string, match: Matcher): number {
  if (match.equals(entry.id, query)) return 0
  if (match.startsWith(entry.id, query)) return 1
  if (match.contains(entry.id, query)) return 2
  if (match.contains(entry.description ?? '', query)) return 3
  return UNMATCHED
}

function matchingItems(entries: RichTextFieldTriggerItem[], query: string, match: Matcher): RichTextFieldTriggerItem[] {
  return entries
    .map((entry) => ({entry, rank: computeRank(entry, query, match)}))
    .filter((ranked) => ranked.rank < UNMATCHED)
    .toSorted(
      (first, second) => first.rank - second.rank || readGroup(first.entry).localeCompare(readGroup(second.entry)),
    )
    .map((ranked) => ranked.entry)
}

export function useComposerTriggerSources(props: PaneCommandProps): PaneCommandSources {
  const host = usePluginHost()
  const instances = useInstances()
  const pluginRank = (plugin: string): number => {
    const index = host.definitions().findIndex((definition) => definition.id === plugin)
    return index === -1 ? Number.POSITIVE_INFINITY : index
  }
  const widgetCommands = createMemo(() => {
    const pluginCommands = host
      .items(Command)
      .toSorted((first, second) => pluginRank(first.plugin) - pluginRank(second.plugin))
      .flatMap(pluginCommand)
    return placeAfterSlash(
      uniqBy(
        [...builtinCommands(props), ...pluginCommands, ...extensionCommands(instances, props)],
        (command) => command.name,
      ),
    )
  })
  const runTyped = (text: string): boolean => {
    const typed = parseTyped(text)
    if (!typed) return false
    const command = findWidgetCommand(widgetCommands(), typed.name)
    if (!command) return false
    command.run(command.arguments ? typed.input : undefined)
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
        const widget = widgetCommands()
        const harnessEntries = harnessCommands
          .filter((command) => !findWidgetCommand(widget, command.name))
          .map(commandEntry)
        return matchingItems([...widget.map(widgetCommandEntry), ...harnessEntries], query, matcher())
      },
    },
    mention: {
      label: 'Context',
      items: async (query) => {
        const [skills, agents, tools] = await Promise.allSettled([
          queryClient.fetchQuery({...appData.utils.skill.list.queryOptions(), staleTime: 0}),
          queryClient.fetchQuery({...appData.utils.agent.list.queryOptions(), staleTime: 0}),
          queryClient.fetchQuery({
            ...appData.utils.meta.tools.queryOptions({input: {sessionId: props.sessionId}}),
            staleTime: 0,
          }),
        ])
        const entries = uniqBy(
          [
            ...settledEntries(skills, 'skills', (value) => value.data.map(skillEntry)),
            ...settledEntries(agents, 'agents', (value) => agentEntries(value.data)),
            ...settledEntries(tools, 'tools', (value) => value.tools.map(toolEntry)),
          ],
          (entry) => entry.id,
        )
        const settled = [skills, agents, tools]
        const failures = settled.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
        if (failures.length === settled.length) throw failures[0]
        return matchingItems(entries, query, matcher())
      },
    },
  }
  return {triggers, runTyped}
}
