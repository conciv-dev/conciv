import type {Accessor} from 'solid-js'
import type {TriggerAdapter, TriggerItem} from '../primitives/composer/trigger/types.js'

export type SlashCommandDef = {
  id: string
  label?: string
  description?: string
  icon?: string
  execute(): void
}

function toItem(command: SlashCommandDef): TriggerItem {
  return {
    id: command.id,
    type: 'command',
    label: command.label ?? `/${command.id}`,
    ...(command.description === undefined ? {} : {description: command.description}),
    ...(command.icon === undefined ? {} : {metadata: {icon: command.icon}}),
  }
}

function matches(command: SlashCommandDef, lower: string): boolean {
  if (!lower) return true
  return (
    command.id.toLowerCase().includes(lower) ||
    (command.label?.toLowerCase().includes(lower) ?? false) ||
    (command.description?.toLowerCase().includes(lower) ?? false)
  )
}

export function createSlashCommandAdapter(options: {
  commands: Accessor<readonly SlashCommandDef[]>
  removeOnExecute?: boolean
}): {adapter: TriggerAdapter; action: {onExecute: (item: TriggerItem) => void; removeOnExecute?: boolean}} {
  const adapter: TriggerAdapter = {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => {
      const lower = query.toLowerCase()
      return options
        .commands()
        .filter((command) => matches(command, lower))
        .map(toItem)
    },
  }
  const action = {
    onExecute: (item: TriggerItem) =>
      options
        .commands()
        .find((command) => command.id === item.id)
        ?.execute(),
    ...(options.removeOnExecute === undefined ? {} : {removeOnExecute: options.removeOnExecute}),
  }
  return {adapter, action}
}
