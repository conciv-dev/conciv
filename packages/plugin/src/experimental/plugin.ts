import type {SetupContext} from './context.js'
import type {Cleanup} from './core.js'
import type {Declarations, Icons, Stores} from './declarations.js'

export type {Cleanup, Declarations}

/**
 * A window setup: the `setup` of `Plugin.define`. `Plugin.Setup<typeof definition>` types one written apart from
 * its declarations, with `ctx.stores` and `ctx.icons` from the declared stores and icons. Runs synchronously under the
 * plugin's Solid owner; return nothing, or a cleanup that runs when the plugin goes away. Put async work in
 * `createKeyed` or `createLatest`, and pass `ctx.signal` or a signal derived from it. The return type rejects async
 * functions and replacement values; the host also rejects thenables from JavaScript bundles.
 *
 * @param ctx - The plugin's context, under its Solid owner.
 *
 * @example
 * ```ts
 * export default Plugin.define({
 *   setup(ctx) {
 *     ctx.add(Command, () => ({ id: "settings", title: "Settings", run: () => ctx.layout.settings(ctx.id) }))
 *   },
 * })
 * ```
 */
export type Setup<D extends Declarations = Declarations<{}, {}>> = (ctx: SetupContext<D>) => Cleanup | void

export type Definition<S extends Stores = Stores, I extends Icons = Icons> = Declarations<S, I> & {
  readonly setup?: Setup<NoInfer<Declarations<S, I>>>
}

/**
 * Defines a plugin's app part, the default export of its `./plugin-experimental` bundle, as `Plugin.define` from
 * `@conciv/plugin` defines its engine part. It declares no id: the host assigns the engine part's (`ctx.id`). The
 * window setup's `ctx.stores` and `ctx.icons` are typed from the declared stores and icons.
 *
 * @param plugin - The declarations and a setup.
 * @returns The same object.
 *
 * @example
 * ```tsx
 * export default Plugin.define({
 *   setup(ctx) {
 *     ctx.add(Command, () => ({ id: "open", title: "Open", run: () => void ctx.client.rpc(Acme).ping({}) }))
 *   },
 * })
 * ```
 */
export function define<const S extends Stores = {}, const I extends Icons = {}>(
  plugin: Definition<S, I> & WithSetup,
): Definition<S, I>
/**
 * Declares a plugin's app part without a setup, so setups written in other files are typed from it
 * (`Plugin.Setup<typeof definition>`) and the app's host lists can attach their own entries. Returns only the
 * declarations.
 *
 * @param plugin - The declarations.
 * @returns The same object.
 */
export function define<const S extends Stores = {}, const I extends Icons = {}>(
  plugin: Declarations<S, I>,
): Declarations<S, I>
/**
 * Returns the plugin as it is; the overloads above carry its types.
 *
 * @param plugin - The declarations, with any setup.
 * @returns The same object.
 */
export function define(plugin: Definition): Definition {
  return plugin
}

type WithSetup = {readonly setup: unknown}
