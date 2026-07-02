import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {makeEngineBooter} from './core/boot.js'
import {makeViteHook} from './core/vite.js'
import {type Builtins, NO_BUILTINS} from './core/extensions.js'

export type {Builtins} from './core/extensions.js'
export {NO_BUILTINS} from './core/extensions.js'
export {concivBuildPlugin} from './core/vite-plumbing.js'

export function createConcivUnplugin(builtins: Builtins = NO_BUILTINS): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const state: {booter: ReturnType<typeof makeEngineBooter> | null} = {booter: null}
    const boot = () => (state.booter ??= makeEngineBooter(options, process.cwd(), builtins))()

    return {
      name: 'conciv',

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

export const unplugin = createConcivUnplugin()

export default unplugin
