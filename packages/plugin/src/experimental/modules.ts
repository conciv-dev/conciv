export const pluginSharedModules = ['@conciv/plugin/experimental', '@conciv/plugin/rpc', 'zod'] as const

export const pluginWindowModules = ['solid-js', 'solid-js/web', 'solid-js/store'] as const

export type PluginModule = (typeof pluginSharedModules)[number] | (typeof pluginWindowModules)[number]
