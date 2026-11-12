/**
 * The modules a plugin's `./plugin-experimental` bundle may require that are not Solid's: the SDK, the RPC contract
 * module and the schema library. `@conciv/plugin/rpc` is here because a plugin's `./rpc` contract imports it, and its
 * app part imports that contract.
 */
export const pluginSharedModules = ['@conciv/plugin/experimental', '@conciv/plugin/rpc', 'zod'] as const

/** The Solid modules the conciv app provides to a plugin's `./plugin-experimental` bundle. */
export const pluginWindowModules = ['solid-js', 'solid-js/web', 'solid-js/store'] as const

/** A module name in `pluginSharedModules` or `pluginWindowModules`. */
export type PluginModule = (typeof pluginSharedModules)[number] | (typeof pluginWindowModules)[number]
