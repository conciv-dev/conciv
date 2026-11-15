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
    shutdown: {tapPromise: (name: string, close: () => Promise<void>) => void}
  }
}

type EngineSlot =
  | {stage: 'idle'}
  | {stage: 'running'; engine: Promise<Engine | undefined>}
  | {stage: 'stopping'; stopped: Promise<void>}

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
    const state: {slot: EngineSlot} = {slot: {stage: 'idle'}}
    const startEngine = async (): Promise<Engine | undefined> => {
      const slot = state.slot
      if (slot.stage === 'running') return slot.engine
      if (slot.stage === 'stopping') {
        await slot.stopped
        return startEngine()
      }
      const engine = makeEngineBooter(options, process.cwd(), builtins, 'exact')().catch(
        reportStartFailure(options.port),
      )
      state.slot = {stage: 'running', engine}
      return engine
    }
    const stopEngine = async (): Promise<void> => {
      const slot = state.slot
      if (slot.stage === 'idle') return
      if (slot.stage === 'stopping') return slot.stopped
      const stopped = slot.engine
        .then((engine) => engine?.stop())
        .catch((error: unknown) => console.error('conciv: stopping the engine failed', error))
        .then(() => {
          state.slot = {stage: 'idle'}
        })
      state.slot = {stage: 'stopping', stopped}
      return stopped
    }
    const startWhileWatching = (compiler: WatchingCompiler) => {
      if (options.enabled === false) return
      compiler.hooks.watchRun.tapPromise('conciv', async () => {
        await startEngine()
      })
      compiler.hooks.watchClose.tap('conciv', stopEngine)
      compiler.hooks.shutdown.tapPromise('conciv', stopEngine)
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
