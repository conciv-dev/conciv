import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {Engine} from '@conciv/core/start'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {Builtins} from '@conciv/extension-compiler/extensions'
import {makeEngineBooter} from './core/boot.js'
import {makeViteHook} from './core/vite.js'

export type {Builtins} from '@conciv/extension-compiler/extensions'

type WatchingCompiler = {
  hooks: {
    watchRun: {tapPromise: (name: string, run: () => Promise<void>) => void}
    watchClose: {tap: (name: string, close: () => void) => void}
  }
}

export function createConcivUnplugin(builtins: Builtins = {}): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const state: {engine: Promise<Engine> | null} = {engine: null}
    const startEngine = () => (state.engine ??= makeEngineBooter(options, process.cwd(), builtins, 'exact')())
    const stopEngine = () =>
      state.engine
        ?.then((engine) => engine.stop())
        .catch((error: unknown) => console.error('conciv: stopping the engine failed', error))
    const startWhileWatching = (compiler: WatchingCompiler) => {
      if (options.enabled === false) return
      compiler.hooks.watchRun.tapPromise('conciv', async () => {
        await startEngine()
      })
      compiler.hooks.watchClose.tap('conciv', stopEngine)
    }

    return {
      name: 'conciv',

      vite: makeViteHook(options, builtins) as UnpluginOptions['vite'],
      webpack: startWhileWatching,
      rspack: startWhileWatching,
      rollup: {},
      esbuild: {},
    }
  })
}

export const unplugin = createConcivUnplugin()

export default unplugin
