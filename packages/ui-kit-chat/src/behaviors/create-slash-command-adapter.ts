import type {TriggerAdapter, TriggerItem} from '../primitives/composer/trigger/types.js'
import type {IconComponent} from './create-mention-adapter.js'

export type SlashCommand = {
  readonly id: string
  readonly label?: string
  readonly description?: string
  readonly icon?: string
  readonly execute: () => void
}

export type SlashCommandAdapterOptions = {
  readonly commands: readonly SlashCommand[]
  readonly removeOnExecute?: boolean
  readonly iconMap?: Record<string, IconComponent>
  readonly fallbackIcon?: IconComponent
}

export type SlashCommandAction = {
  readonly onExecute: (item: TriggerItem) => void
  readonly removeOnExecute?: boolean
}

export function createSlashCommandAdapter(options: SlashCommandAdapterOptions): {
  adapter: TriggerAdapter
  action: SlashCommandAction
  iconMap?: Record<string, IconComponent>
  fallbackIcon?: IconComponent
} {
  const {commands, removeOnExecute} = options

  const adapter: TriggerAdapter = {
    categories: () => [],
    categoryItems: () => [],
    search: (query: string) => {
      const lower = query.toLowerCase()
      return commands.filter((command) => matchesQuery(command, lower)).map(toItem)
    },
  }

  const action: SlashCommandAction = {
    onExecute: (item) => {
      commands.find((command) => command.id === item.id)?.execute()
    },
    ...(removeOnExecute === undefined ? {} : {removeOnExecute}),
  }

  return {
    adapter,
    action,
    ...(options.iconMap ? {iconMap: options.iconMap} : {}),
    ...(options.fallbackIcon ? {fallbackIcon: options.fallbackIcon} : {}),
  }
}

function toItem(command: SlashCommand): TriggerItem {
  return {
    id: command.id,
    type: 'command',
    label: command.label ?? `/${command.id}`,
    ...(command.description !== undefined ? {description: command.description} : {}),
    ...(command.icon !== undefined ? {metadata: {icon: command.icon}} : {}),
  }
}

function matchesQuery(command: SlashCommand, lower: string): boolean {
  if (!lower) return true
  if (command.id.toLowerCase().includes(lower)) return true
  if (command.label?.toLowerCase().includes(lower)) return true
  if (command.description?.toLowerCase().includes(lower)) return true
  return false
}
