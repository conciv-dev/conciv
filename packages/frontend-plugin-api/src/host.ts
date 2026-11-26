import type {Cleanup} from './core.js'
import type {Declarations} from './declarations.js'

export {Scope} from './scope.js'

export {DrawerContext, LifetimeContext, liveAccessor, PanelContext, PluginContext} from './internal.js'

export interface Entry extends Declarations {
  readonly id: string
  readonly windowEntry?: () => Promise<{
    readonly default: (ctx: never) => Cleanup | void
  }>
}

/**
 * Composes the app's built-in plugins, the way the host lists them: each built-in's `Plugin.define` declarations plus
 * the entry the host loads lazily (`windowEntry`), under its id.
 *
 * @param entries - Every built-in, by id, in the order the host lists them.
 * @returns The entries, each with its id.
 *
 * @example
 * ```ts
 * export const builtins = compose({ page: { ...page, windowEntry: () => import("./page/plugin-experimental") } })
 * ```
 */
export function compose(entries: Readonly<Record<string, Omit<Entry, 'id'>>>): Entry[] {
  return Object.entries(entries).map(([id, entry]) => ({...entry, id}))
}

export {pluginSharedModules, pluginWindowModules, type PluginModule} from './modules.js'
