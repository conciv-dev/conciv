import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import {z} from 'zod'
import type {Engine} from '@conciv/core/start'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {makeEngineBooter, type Builtins} from './core/boot.js'
import {widgetStarterPath, writeWidgetClient} from './core/bundler-widget.js'
import {CONCIV_DEFAULT_PORT, WIDGET_START_SPECIFIER} from './core/nextjs.js'
import {makeViteHook} from './core/vite.js'

export type {Builtins} from './core/boot.js'

type WatchingCompiler = {
  hooks: {
    watchRun: {tapPromise: (name: string, run: () => Promise<void>) => void}
    watchClose: {tap: (name: string, close: () => void) => void}
    shutdown: {tapPromise: (name: string, close: () => Promise<void>) => void}
  }
}

type ResolveAlias = Record<string, unknown> | ReadonlyArray<unknown> | false | undefined

type BundlerCompiler = WatchingCompiler & {
  context: string
  options: {mode?: string; resolve: {alias?: ResolveAlias}}
  webpack: {
    EntryPlugin: new (
      context: string,
      entry: string,
      options: {name: undefined},
    ) => {apply(compiler: BundlerCompiler): void}
  }
}

type EngineSlot =
  | {stage: 'idle'}
  | {stage: 'running'; engine: Promise<Engine | undefined>}
  | {stage: 'stopping'; stopped: Promise<void>}

const AddressInUse = z.object({code: z.literal('EADDRINUSE')})

function withAlias(alias: ResolveAlias, specifier: string, path: string): ResolveAlias {
  if (Array.isArray(alias)) return [...alias, {name: specifier, alias: path}]
  return {...alias, [specifier]: path}
}

function reportStartFailure(port: number): (error: unknown) => undefined {
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
    const bundlerOptions = {...options, port: options.port ?? CONCIV_DEFAULT_PORT}
    const state: {slot: EngineSlot} = {slot: {stage: 'idle'}}
    const startEngine = async (): Promise<Engine | undefined> => {
      const slot = state.slot
      if (slot.stage === 'running') return slot.engine
      if (slot.stage === 'stopping') {
        await slot.stopped
        return startEngine()
      }
      const engine = makeEngineBooter(bundlerOptions, process.cwd(), builtins, 'exact')().catch(
        reportStartFailure(bundlerOptions.port),
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
    const serveWidgetInDevelopment = (compiler: BundlerCompiler) => {
      if (options.enabled === false || (compiler.options.mode ?? 'production') === 'production') return
      compiler.hooks.watchRun.tapPromise('conciv', async () => {
        await startEngine()
      })
      compiler.hooks.watchClose.tap('conciv', stopEngine)
      compiler.hooks.shutdown.tapPromise('conciv', stopEngine)
      if (options.widget === false) return
      const client = writeWidgetClient(compiler.context, bundlerOptions.port)
      if (client === undefined) return
      compiler.options.resolve.alias = withAlias(
        compiler.options.resolve.alias,
        WIDGET_START_SPECIFIER,
        widgetStarterPath(),
      )
      new compiler.webpack.EntryPlugin(compiler.context, client, {name: undefined}).apply(compiler)
    }

    return {
      name: 'conciv',

      vite: makeViteHook(options, builtins) as UnpluginOptions['vite'],
      webpack: serveWidgetInDevelopment,
      rspack: serveWidgetInDevelopment,
      rollup: {},
      esbuild: {},
    }
  })
}

export const unplugin = createConcivUnplugin()

export default unplugin
