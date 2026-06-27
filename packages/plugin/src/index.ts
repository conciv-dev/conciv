import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {MandaraxConfig} from '@mandarax/protocol/config-types'
import {makeEngineBooter} from './core/boot.js'
import {makeViteHook} from './core/vite.js'
import {type Builtins, NO_BUILTINS} from './core/extensions.js'

export type {Builtins} from './core/extensions.js'
export {NO_BUILTINS} from './core/extensions.js'
export {mandaraxBuildPlugin} from './core/vite-plumbing.js'

// The mandarax unplugin factory, parameterized by the built-in extensions a host wires in (the plugin
// itself imports no concrete extension — @mandarax/qu supplies the shipped built-ins, the testkit the
// extension under test). vite = the rich hook (live viteBridge + widget middleware + boot). webpack/
// rspack boot the engine bridge-less. rollup/esbuild: build-only no-ops.
export function createMandaraxUnplugin(builtins: Builtins = NO_BUILTINS): UnpluginInstance<MandaraxConfig | undefined> {
  return createUnplugin<MandaraxConfig | undefined>((options = {}) => {
    const state: {booter: ReturnType<typeof makeEngineBooter> | null} = {booter: null}
    const boot = () => (state.booter ??= makeEngineBooter(options, process.cwd(), builtins))()

    return {
      name: 'mandarax',
      // unplugin resolves its own `vite` (the yaml-peer variant); this package's devDep vite
      // resolves without that peer, so TS treats the two structurally-identical `Plugin` types
      // as unrelated. Cast at the boundary to unplugin's expected vite type.
      vite: makeViteHook(options, builtins) as UnpluginOptions['vite'],
      webpack() {
        if (options.enabled !== false) void boot()
      },
      rspack() {
        if (options.enabled !== false) void boot()
      },
      rollup: {},
      esbuild: {},
    }
  })
}

export const unplugin = createMandaraxUnplugin()

export default unplugin
