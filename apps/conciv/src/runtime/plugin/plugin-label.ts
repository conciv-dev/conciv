import type {PluginInfo} from '@conciv/plugin'

export function pluginLabel(plugin: PluginInfo) {
  if (plugin.id) return plugin.id

  if (plugin.source.type === 'package') return plugin.source.target

  if (plugin.source.type === 'local') return plugin.source.path

  return plugin.source.type
}
