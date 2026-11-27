export const pluginSharedModules = [
  'effect',
  '@conciv/frontend-plugin-api',
  '@conciv/protocol/schema/rpc',
  'zod',
  '@conciv/errors',
] as const

export const pluginWindowModules = [
  'solid-js',
  'solid-js/web',
  'solid-js/store',
  '@conciv/client',
  '@conciv/frontend-plugin-api/page',
  '@conciv/frontend-plugin-api/grab',
] as const

export type PluginModule = (typeof pluginSharedModules)[number] | (typeof pluginWindowModules)[number]
