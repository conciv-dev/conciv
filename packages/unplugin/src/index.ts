import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {Engine} from '@conciv/core/start'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {makeEngineBooter, type Builtins} from './core/boot.js'
import {CONCIV_DEFAULT_PORT, WIDGET_START_SPECIFIER, chooseEnginePort} from './core/nextjs.js'
import {makeViteHook} from './core/vite.js'
import {writeFileSync} from 'node:fs'
import {findPackageJSON} from 'node:module'
import {dirname, join} from 'node:path'
import {concivStateDir, createConcivStateDir} from '@conciv/protocol/state-types'
import {isEnginePort} from './core/widget-start.js'

function widgetStarterPath(): string {
  const manifest = findPackageJSON(import.meta.url)
  if (manifest === undefined) throw new Error('conciv: the @conciv/unplugin package.json was not found')
  return join(dirname(manifest), 'dist', 'core', 'widget-start.js')
}

function writeWidgetClient(root: string, client: {askedPort: number; port: number}): string | undefined {
  const {askedPort, port} = client
  if (!isEnginePort(port)) {
    console.error(
      `conciv: the engine port must be an integer from 1 to 65535, got ${String(port)}, so the page gets no widget`,
    )
    return undefined
  }
  const stateDir = concivStateDir(root)
  const path = join(stateDir, `widget-client.${String(askedPort)}.gen.js`)
  const source = [
    `import {startConcivWidget} from '${WIDGET_START_SPECIFIER}'`,
    `startConcivWidget(${String(port)})`,
    '',
  ].join('\n')
  try {
    createConcivStateDir(stateDir)
    writeFileSync(path, source, 'utf8')
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    console.error(`conciv: could not write the widget client ${path}, so the page gets no widget: ${cause}`)
    return undefined
  }
  return path
}

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
  | {stage: 'running'; engine: Promise<Engine>}
  | {stage: 'stopping'; stopped: Promise<void>}

function withAlias(alias: ResolveAlias, specifier: string, path: string): ResolveAlias {
  if (Array.isArray(alias)) return [...alias, {name: specifier, alias: path}]
  return {...alias, [specifier]: path}
}

function reportStartFailure(error: unknown): never {
  throw new Error('conciv: the engine failed to start', {cause: error})
}

export function createConcivUnplugin(builtins: Builtins = {}): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const askedPort = options.port ?? CONCIV_DEFAULT_PORT
    const state: {slot: EngineSlot} = {slot: {stage: 'idle'}}
    const startEngine = async (onPort: (port: number) => void): Promise<Engine> => {
      const slot = state.slot
      if (slot.stage === 'running') return slot.engine
      if (slot.stage === 'stopping') {
        await slot.stopped
        return startEngine(onPort)
      }
      const engine = chooseEnginePort(options.port, options.stateRoot ?? process.cwd())
        .then((port) => {
          onPort(port)
          return makeEngineBooter({...options, port}, process.cwd(), builtins)()
        })
        .catch(reportStartFailure)
      state.slot = {stage: 'running', engine}
      return engine
    }
    const stopEngine = async (): Promise<void> => {
      const slot = state.slot
      if (slot.stage === 'idle') return
      if (slot.stage === 'stopping') return slot.stopped
      const stopped = slot.engine
        .then(
          (engine) => engine.stop(),
          () => undefined,
        )
        .catch((error: unknown) => console.error('conciv: stopping the engine failed', error))
        .then(() => {
          state.slot = {stage: 'idle'}
        })
      state.slot = {stage: 'stopping', stopped}
      return stopped
    }
    const serveWidgetInDevelopment = (compiler: BundlerCompiler) => {
      if (options.enabled === false || (compiler.options.mode ?? 'production') === 'production') return
      const client =
        options.widget === false ? undefined : writeWidgetClient(compiler.context, {askedPort, port: askedPort})
      compiler.hooks.watchRun.tapPromise('conciv', async () => {
        await startEngine((port) => {
          if (client !== undefined) writeWidgetClient(compiler.context, {askedPort, port})
        })
      })
      compiler.hooks.watchClose.tap('conciv', stopEngine)
      compiler.hooks.shutdown.tapPromise('conciv', stopEngine)
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

export const unplugin: UnpluginInstance<ConcivConfig | undefined> = createConcivUnplugin()

export default unplugin
