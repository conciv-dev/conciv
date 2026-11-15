import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import {z} from 'zod'
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

const AddressInUse = z.object({code: z.literal('EADDRINUSE')})

function reportStartFailure(port: number | undefined): (error: unknown) => undefined {
  return (error) => {
    if (AddressInUse.safeParse(error).success) {
      console.error(
        `conciv: port ${port} is already in use, the engine did not start. Free the port or pass another port to conciv()`,
      )
      return undefined
    }
    console.error('conciv: the engine failed to start', error)
    return undefined
  }
}

export function createConcivUnplugin(builtins: Builtins = {}): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const state: {engine: Promise<Engine | undefined> | null} = {engine: null}
    const startEngine = () =>
      (state.engine ??= makeEngineBooter(options, process.cwd(), builtins, 'exact')().catch(
        reportStartFailure(options.port),
      ))
    const stopEngine = () =>
      state.engine
        ?.then((engine) => engine?.stop())
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
