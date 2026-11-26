import {fileURLToPath} from 'node:url'
import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import type {ConcivConfig} from '@conciv/types/config-types'
import {
  createHarnessEngine,
  type CreateBackend,
  type HarnessEngine,
  type HarnessEngineAddress,
  type HarnessEngineSession,
  type HarnessEngineStart,
  type HarnessEngineSetting,
  type HarnessEngineTool,
  type HarnessEngineToolFailure,
} from './harness-engine.js'
import type {HarnessEngineClock} from './clock.js'
import {pluginDirectory, serverPlugin} from './plugin-directory.js'

export type EngineSetting = HarnessEngineSetting

export type {CreateBackend, HarnessEngineStart}

export type EngineStart = Omit<HarnessEngineStart, 'plugins'> & {plugins?: readonly (Plugin | string)[]}

export type {EngineCommandHandlers, EngineCommands, EngineHandle} from './browser-commands.js'

export {engineCommands} from './browser-commands.js'

export type {BackendStart, StartedBackend} from './harness-engine.js'

export type {Outside, OutsideAgent, OutsideReply} from './outside.js'

export type {EngineDrive} from './drive.js'

export {browserClient, type BrowserClient} from './browser-client.js'

export {pluginDirectory}

export type ToolFailure = HarnessEngineToolFailure

export type EngineTool = HarnessEngineTool

export type EngineSession = HarnessEngineSession

export type EngineClock = Omit<HarnessEngineClock, 'tick'>

export type Engine = Omit<HarnessEngine, 'stop' | 'clock'> & {clock: EngineClock}

export type EngineAddress = HarnessEngineAddress

export type StartedEngine = Engine & {stop: () => Promise<void>; tick: () => Promise<void>}

type PluginEntry = NonNullable<ConcivConfig['plugins']>[number]

function isSelector(target: string): boolean {
  return target.startsWith('-') || target.includes('*') || target.startsWith('conciv.')
}

function isProjectPath(target: string): boolean {
  return target.startsWith('./') || target.startsWith('../')
}

function locateTarget(target: string, inProject: boolean): string {
  if (isSelector(target) || (inProject && isProjectPath(target))) return target
  return pluginDirectory(target)
}

function locatePlugin(entry: PluginEntry, inProject: boolean): PluginEntry {
  if (typeof entry === 'string') return locateTarget(entry, inProject)
  return [locateTarget(entry[0], inProject), entry[1]]
}

export async function createEngine(
  createBackend: CreateBackend,
  config: ConcivConfig = {},
  options: EngineStart = {},
): Promise<StartedEngine> {
  const plugins = config.plugins?.map((entry) => locatePlugin(entry, options.directory !== undefined))
  const served =
    options.plugins === undefined
      ? undefined
      : await Promise.all(options.plugins.map((plugin) => (typeof plugin === 'string' ? serverPlugin(plugin) : plugin)))
  const {clock, ...engine} = await createHarnessEngine(
    createBackend,
    plugins === undefined ? config : {...config, plugins},
    {...options, plugins: served},
  )
  return {...engine, clock: {advance: clock.advance, drain: clock.drain}, tick: clock.tick}
}

export type EngineFixtures = {
  createEngine: (config?: ConcivConfig, options?: EngineStart) => Promise<Engine>
}

type UseEngineFixture = (run: EngineFixtures['createEngine']) => Promise<void>

type EngineFixture = (context: {task: unknown}, use: UseEngineFixture) => Promise<void>

export function engineFixture(createBackend: CreateBackend): EngineFixture {
  return async ({task: _task}, use) => {
    const started: StartedEngine[] = []
    await use(async (config, options) => {
      const engine = await createEngine(createBackend, config, options)
      started.push(engine)
      return engine
    })
    const stopped = await Promise.allSettled(started.map((engine) => engine.stop()))
    const failures = stopped.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
    if (failures.length > 0) throw new AggregateError(failures, 'an engine the test started did not stop cleanly')
  }
}

export const listerPlugin: string = fileURLToPath(new URL('./fixtures/lister', import.meta.url))
