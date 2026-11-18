export const pluginSharedModules = ['effect', '@conciv/plugin/experimental', '@conciv/plugin/rpc', 'zod'] as const

export const pluginWindowModules = [
  'solid-js',
  'solid-js/web',
  'solid-js/store',
  '@conciv/plugin/experimental/page',
  '@conciv/plugin/experimental/grab',
  '@conciv/ui-kit-tap',
] as const

export type PluginModule = (typeof pluginSharedModules)[number] | (typeof pluginWindowModules)[number]
