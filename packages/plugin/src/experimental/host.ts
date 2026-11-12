import type {PluginInfo} from '../plugin.js'
import type {BuiltinStoreDeclaration} from './builtin.js'
import type {Cleanup} from './core.js'
import type {Declarations} from './declarations.js'

export {Scope} from './scope.js'

/**
 * A plugin as a host runs it: its id, its `Plugin.Declarations`, plus the setup the host loads lazily. A built-in's
 * entry is its app part module; a plugin's `./plugin-experimental` bundle becomes a window entry that runs its `setup`.
 */
export interface Entry extends Declarations {
  /** Window state, as `Declarations.stores`; a built-in's stores may name older homes in `builtinFrom`. */
  readonly stores?: Readonly<Record<string, BuiltinStoreDeclaration>>
  /**
   * The plugin's id: a built-in's key in `compose`, or the engine plugin's id for a bundle. It prefixes every id the
   * plugin creates: commands (`<id>.<command>`), panel keys (`<id>:<tab>`), stored keys (`plugin.<id>.<key>`), and
   * its contract ids (`<id>` or `<id>.<name>`). The plugin reads it as `ctx.id`.
   */
  readonly id: string
  /** Loads the window setup (`Plugin.Setup<typeof definition>`). */
  readonly windowEntry?: () => Promise<{
    /** The window setup. */
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

/** One explicit enable-state row. An absent row means there is no setting under that id. */
export interface EnableState {
  /** The plugin id the user saved a setting under. */
  readonly id: string
  /** The saved setting: true enables the plugin; false disables it. */
  readonly enabled: boolean
}

/**
 * Resolves enable state. A built-in always runs, whatever row is saved under its id; any other plugin follows the row
 * saved under its id, or is enabled when there is none.
 *
 * @param plugin - The plugin, and whether it ships with the app.
 * @param state - Explicit saved rows, or the host's resolved list.
 * @returns Whether the plugin is enabled.
 */
export function pluginEnabled(
  plugin: {
    /** The plugin's id. */
    readonly id: string
    /** Ships with the app. */
    readonly builtin: boolean
  },
  state: readonly EnableState[],
) {
  if (plugin.builtin) return true

  return state.find((item) => item.id === plugin.id)?.enabled ?? true
}

/**
 * Whether a plugin's app part may take an id. Built-ins win: a plugin cannot take a built-in's id, an id that nests
 * under one or that one nests under (tokens and stored keys resolve by dot-separated prefix), or the `conciv`
 * namespace.
 *
 * @param id - The engine plugin's id.
 * @param builtins - The host's built-in definitions.
 * @returns True when no built-in claims the id.
 */
export function pluginIdAvailable(id: string, builtins: readonly Pick<Entry, 'id'>[]) {
  return [{id: 'conciv'}, ...builtins].every(
    (taken) => id !== taken.id && !id.startsWith(`${taken.id}.`) && !taken.id.startsWith(`${id}.`),
  )
}

/** A plugin's app part as the host lists it: a built-in, or the app part of a plugin on the engine. */
export interface Installed {
  /** The plugin's id. */
  readonly id: string
  /** Ships with the app. */
  readonly builtin: boolean
  /** The user has it enabled. */
  readonly enabled: boolean
  /** Why its entry failed, if it did. */
  readonly error?: string
  /** A plugin from the config with an engine part, which this row's switch leaves running. */
  readonly server?: boolean
}

/**
 * Whether an engine plugin's app part loads: an active plugin with an id, not one of the engine's own built-ins, that
 * exports `./plugin-experimental`. The host lists plugins with it; `pluginIdAvailable` then checks the id against the
 * built-ins.
 *
 * @param plugin - A plugin as the engine lists it.
 * @returns True when the plugin's `./plugin-experimental` bundle should load.
 */
export function shipsPluginExperimental(plugin: PluginInfo): plugin is PluginInfo & {
  /** The engine plugin's id, which the host gives its app part. */
  readonly id: string
} {
  return (
    !!plugin.id &&
    plugin.source.type !== 'builtin' &&
    plugin.state.status === 'active' &&
    !!plugin.features.experimental
  )
}
