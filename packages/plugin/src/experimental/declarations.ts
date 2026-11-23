import type {PluginOptions} from '../options.js'
import type {StoreDeclaration} from './core.js'

export type Stores = Readonly<Record<string, StoreDeclaration>>

export type Enforce = 'pre' | 'post'

export interface Declarations<S extends Stores = Stores> {
  readonly stores?: S
  /**
   * Runs once, synchronously, with the plugin's options, before any plugin's window setup: as soon as the host knows
   * the plugin, which for a built-in is the top of the app's mount. For page-wide hooks that must exist before the
   * host page's own code reads them. `enforce` orders the calls as Vite orders plugins: every `pre`, then those
   * without, then every `post`. Return nothing; a throw is logged and the plugin still loads.
   *
   * @example
   * ```ts
   * export default Plugin.define({ enforce: "pre", beforeRegister: () => installHook(), setup(ctx) {} })
   * ```
   */
  readonly beforeRegister?: (options: PluginOptions) => void
  readonly enforce?: Enforce
}
