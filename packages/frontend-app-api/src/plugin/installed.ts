import type {PluginInfo} from '@conciv/client/plugin'
import type {Entry} from '@conciv/frontend-plugin-api/host'

export type EnableState = {
  readonly id: string
  readonly enabled: boolean
}

export function pluginEnabled(
  plugin: {
    readonly id: string
    readonly builtin: boolean
  },
  state: readonly EnableState[],
) {
  if (plugin.builtin) return true

  return state.find((item) => item.id === plugin.id)?.enabled ?? true
}

export function pluginIdAvailable(id: string, builtins: readonly Pick<Entry, 'id'>[]) {
  return [{id: 'conciv'}, ...builtins].every(
    (taken) => id !== taken.id && !id.startsWith(`${taken.id}.`) && !taken.id.startsWith(`${id}.`),
  )
}

export type Installed = {
  readonly id: string
  readonly builtin: boolean
  readonly enabled: boolean
  readonly error?: string
  readonly server?: boolean
}

export function shipsPluginExperimental(plugin: PluginInfo): plugin is PluginInfo & {
  readonly id: string
} {
  return (
    !!plugin.id &&
    plugin.source.type !== 'builtin' &&
    plugin.state.status === 'active' &&
    !!plugin.features.experimental
  )
}

export type PluginChunk = {
  readonly file: string
  readonly code: string
}
