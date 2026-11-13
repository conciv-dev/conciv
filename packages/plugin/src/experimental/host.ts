import {z} from 'zod'
import type {PluginInfo} from '../plugin.js'
import type {Cleanup} from './core.js'
import type {Declarations, Stores} from './declarations.js'

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

export interface EnableState {
  readonly id: string
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
    readonly id: string
    readonly builtin: boolean
  },
  state: readonly EnableState[],
) {
  if (plugin.builtin) return true

  return state.find((item) => item.id === plugin.id)?.enabled ?? true
}

export {pluginSharedModules, pluginWindowModules, type PluginModule} from './modules.js'

const nodeBuiltins = new Set([
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'inspector/promises',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'readline/promises',
  'repl',
  'stream',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
])

/**
 * Whether a module exists only outside the browser: Node built-ins. The conciv app gives a plugin's
 * `./plugin-experimental` bundle an inert placeholder for it.
 *
 * @param name - The name the bundle requires.
 * @returns True for `node:` names and Node built-ins.
 */
export function mainOnlyModule(name: string) {
  return name.startsWith('node:') || nodeBuiltins.has(name)
}

/**
 * A placeholder for a module the browser does not have, so a plugin's `./plugin-experimental` bundle that names a Node
 * built-in still evaluates. Bundlers hoist `require` calls and Solid hoists template creation to module scope, so the
 * placeholder accepts any property read, call or construction and returns itself, and ignores writes. It is never a
 * thenable, so a promise never waits on it, and nothing is an instance of it. Code that actually runs gets
 * placeholders back instead of working values.
 *
 * @param name - The module's name, shown when the placeholder is converted to a string.
 * @returns The placeholder.
 */
export function inertModule(name: string): InertModule {
  const label = `[inert module ${name}]`

  const handler: ProxyHandler<InertModule> = {
    get(_, key) {
      if (key === 'then') return undefined

      if (key === Symbol.toPrimitive || key === 'toString') return () => label

      if (key === Symbol.hasInstance) return () => false

      return placeholder
    },
    set: () => true,
    defineProperty: () => true,
    deleteProperty: () => true,
    apply: () => placeholder,
    construct: () => placeholder,
  }

  const placeholder = new Proxy<InertModule>(function inert() {}, handler)

  return placeholder
}

export type InertModule = () => void

export interface PluginBundle {
  readonly definition: Declarations
  readonly setup?: (ctx: never) => Cleanup | void
}

export interface PluginBundleHost {
  /**
   * Returns the module the bundle requires.
   *
   * @param name - The module name the bundle passes to `require`.
   * @returns The module the page provides.
   * @throws For a module the page does not provide.
   */
  require(name: string): object
}

/**
 * Evaluates a plugin's `./plugin-experimental` bundle, a CommonJS module whose default export is its `Plugin.define`,
 * and checks it: the declarations the host reads and a setup. The host calls it with its own `require`. The bundle's
 * code is trusted as much as the engine that serves the app, which already loads the plugin.
 *
 * @param code - The bundle's CommonJS code.
 * @param host - The page evaluating it.
 * @returns The checked plugin.
 * @throws When evaluation throws, the default export is not a `Plugin.define` this app supports, or it has no setup.
 */
export function evaluatePluginBundle(code: string, host: PluginBundleHost): PluginBundle {
  const module: BundleModule = {exports: {}}

  new Function('require', 'module', 'exports', code)(host.require, module, module.exports)
  const plugin = 'default' in module.exports ? module.exports.default : module.exports

  if (!matchesPlugin(plugin)) {
    const decoded = BundleDefinition.safeParse(plugin)
    const problem = decoded.success ? 'it does not match' : z.prettifyError(decoded.error)

    throw new Error(
      `A plugin's ./plugin-experimental bundle must default-export a \`Plugin.define\` from \`@conciv/plugin/experimental\`: ${problem}`,
    )
  }

  if (!plugin.setup) throw new Error("A plugin's ./plugin-experimental bundle must have a window `setup`")

  return {definition: {stores: plugin.stores}, setup: plugin.setup}
}

type BundleModule = {exports: object}

type BundlePlugin = {
  readonly stores?: Stores
  readonly setup?: (ctx: never) => Cleanup | void
}

const BundleDefinition = z.object({
  stores: z
    .record(z.string(), z.object({scope: z.enum(['global', 'project', 'session']), schema: z.instanceof(z.ZodObject)}))
    .optional(),
  setup: z.custom((value) => typeof value === 'function').optional(),
})

function matchesPlugin(plugin: unknown): plugin is BundlePlugin {
  return BundleDefinition.safeParse(plugin).success
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

export interface Installed {
  readonly id: string
  readonly builtin: boolean
  readonly enabled: boolean
  readonly error?: string
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
  readonly id: string
} {
  return (
    !!plugin.id &&
    plugin.source.type !== 'builtin' &&
    plugin.state.status === 'active' &&
    !!plugin.features.experimental
  )
}
