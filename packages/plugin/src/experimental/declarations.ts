import type {StoreDeclaration} from './core.js'

/** The stores a plugin's app part may declare. */
export type Stores = Readonly<Record<string, StoreDeclaration>>

/**
 * What a plugin's app part declares: its window state. `Plugin.define` returns this for a definition without a setup,
 * so setups in other files are typed from it (`Plugin.Setup<typeof definition>`). The host reads it before any setup
 * runs. The plugin's id is not declared here: the host assigns it (`ctx.id`), from the engine part for a
 * `./plugin-experimental` bundle. Contracts are provided and read at runtime, with `ctx.provide` and `ctx.use`.
 */
export interface Declarations<S extends Stores = Stores> {
  /**
   * Window state the host stores for the plugin, by store name, loaded before it is read. See `Store`. Keys known only
   * at runtime go through `ctx.storage.store`.
   */
  readonly stores?: S
}
