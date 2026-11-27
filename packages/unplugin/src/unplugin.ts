import {log} from 'evlog'
import {createUnplugin, type UnpluginInstance, type UnpluginOptions} from 'unplugin'
import type {Engine} from '@conciv/backend/start'
import type {ConcivConfig, LogLevel} from '@conciv/types/config-types'
import {makeEngineBooter, type Builtins} from './core/boot.js'
import {CONCIV_DEFAULT_PORT, WIDGET_START_SPECIFIER, chooseEnginePort} from './core/nextjs.js'
import {makeViteHook} from './core/vite.js'
import {makePluginBundlerHooks} from './core/plugin-bundlers.js'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {concivStateDir} from '@conciv/types/state-types'
import {isEnginePort} from './core/widget-start.js'
import {widgetStarterPath} from './core/widget-module.js'
import {startHostLog} from './core/host-log.js'
import {causeFrom, unpluginErrors} from '@conciv/errors'

const STATE_GITIGNORE = ['*', '!.gitignore', '!settings/', '!settings/**', ''].join('\n')

function createStateDirNow(stateDir: string): void {
  mkdirSync(stateDir, {recursive: true})
  const ignoreFile = join(stateDir, '.gitignore')
  if (existsSync(ignoreFile)) return
  try {
    writeFileSync(ignoreFile, STATE_GITIGNORE, {flag: 'wx'})
  } catch (error) {
    log.error({action: 'unplugin', message: 'could not write the state folder ignore file', path: ignoreFile, error})
  }
}

function writeWidgetClient(
  root: string,
  client: {askedPort: number; port: number; logLevel: LogLevel},
): string | undefined {
  const {askedPort, port, logLevel} = client
  if (!isEnginePort(port)) {
    log.error({
      action: 'unplugin',
      message: 'the engine port must be an integer from 1 to 65535, so the page gets no widget',
      port: String(port),
    })
    return undefined
  }
  const stateDir = concivStateDir(root)
  const path = join(stateDir, `widget-client.${String(askedPort)}.gen.js`)
  const source = [
    `import {startConcivWidget} from '${WIDGET_START_SPECIFIER}'`,
    `startConcivWidget(${String(port)}, ${JSON.stringify(logLevel)})`,
    '',
  ].join('\n')
  try {
    createStateDirNow(stateDir)
    writeFileSync(path, source, 'utf8')
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    log.error({
      action: 'unplugin',
      message: `could not write the widget client, so the page gets no widget: ${cause}`,
      path,
    })
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
  throw unpluginErrors.ENGINE_START_FAILED(causeFrom(error))
}

export function createConcivUnplugin(builtins: Builtins = {}): UnpluginInstance<ConcivConfig | undefined> {
  return createUnplugin<ConcivConfig | undefined>((options = {}) => {
    const logLevel = startHostLog(options.logLevel)
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
        .catch((error: unknown) => log.error({action: 'unplugin', message: 'stopping the engine failed', error}))
        .then(() => {
          state.slot = {stage: 'idle'}
        })
      state.slot = {stage: 'stopping', stopped}
      return stopped
    }
    const serveWidgetInDevelopment = (compiler: BundlerCompiler) => {
      if (options.enabled === false || (compiler.options.mode ?? 'production') === 'production') return
      const client =
        options.widget === false
          ? undefined
          : writeWidgetClient(compiler.context, {askedPort, port: askedPort, logLevel})
      compiler.hooks.watchRun.tapPromise('conciv', async () => {
        await startEngine((port) => {
          if (client === undefined || writeWidgetClient(compiler.context, {askedPort, port, logLevel}) !== undefined)
            return
          throw unpluginErrors.WIDGET_CLIENT_NOT_REWRITTEN({port})
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

    const vite = makeViteHook(options, builtins, logLevel)
    const running = () => state.slot.stage === 'running'
    return [
      {
        name: 'conciv',

        vite: vite as UnpluginOptions['vite'],
        webpack: serveWidgetInDevelopment,
        rspack: serveWidgetInDevelopment,
        rollup: {},
        esbuild: {},
      },
      {
        name: 'conciv:plugins',
        transformInclude: running,
        loadInclude: running,
        ...makePluginBundlerHooks(() => (state.slot.stage === 'running' ? state.slot.engine : undefined)),
        vite: {apply: 'serve', enforce: 'pre', ...makePluginBundlerHooks(vite.api.engine)},
      },
    ]
  })
}

export const unplugin: UnpluginInstance<ConcivConfig | undefined> = createConcivUnplugin()

export default unplugin
