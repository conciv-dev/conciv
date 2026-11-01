import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {makeEngineBooter} from './core/boot.js'
import {forwardDevServerHub} from './core/dev-server-hub.js'
import {makeViteHook} from './core/vite.js'
import {type Builtins, NO_BUILTINS} from '@conciv/extension-compiler/extensions'

export type {Builtins} from '@conciv/extension-compiler/extensions'
export {NO_BUILTINS} from '@conciv/extension-compiler/extensions'

export function createConcivUnplugin(builtins: Builtins = NO_BUILTINS): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const state: {booter: ReturnType<typeof makeEngineBooter> | null} = {booter: null}
    const boot = () => (state.booter ??= makeEngineBooter(options, process.cwd(), builtins, 'exact'))()

    return {
      name: 'conciv',

      vite: makeViteHook(options, builtins) as UnpluginOptions['vite'],
      webpack(compiler) {
        if (options.enabled === false) return
        void boot()
        forwardDevServerHub(compiler.options, boot)
      },
      rspack(compiler) {
        if (options.enabled === false) return
        void boot()
        forwardDevServerHub(compiler.options, boot)
      },
      rollup: {},
      esbuild: {},
    }
  })
}

export const unplugin = createConcivUnplugin()

export default unplugin
