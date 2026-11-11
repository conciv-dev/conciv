import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {Builtins} from '@conciv/extension-compiler/extensions'
import {makeEngineBooter} from './core/boot.js'
import {makeViteHook} from './core/vite.js'

export type {Builtins} from '@conciv/extension-compiler/extensions'

export function createConcivUnplugin(builtins: Builtins = {}): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const state: {booter: ReturnType<typeof makeEngineBooter> | null} = {booter: null}
    const boot = () => (state.booter ??= makeEngineBooter(options, process.cwd(), builtins, 'exact'))()

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
export {withConciv, register, CONCIV_DEFAULT_PORT} from './core/nextjs.js'
export type {ConcivConfig} from '@conciv/protocol/config-types'
