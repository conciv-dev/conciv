import {
  createHarnessEngine,
  type HarnessEngine,
  type HarnessEngineAddress,
  type EngineStart,
  type HarnessEngineClock,
  type HarnessEngineSession,
  type HarnessEngineSetting,
  type HarnessEngineTool,
  type HarnessEngineToolFailure,
} from '@conciv/harness-testkit'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {engineTests} from './engine-tests.js'
import {fileEngines} from './file-engines.js'
import {pluginDirectory} from './plugin-directory.js'

export type EngineSetting = HarnessEngineSetting

export type {EngineStart}

export type ToolFailure = HarnessEngineToolFailure

export type EngineTool = HarnessEngineTool

export type EngineSession = HarnessEngineSession

export type EngineClock = Omit<HarnessEngineClock, 'tick'>

export type Engine = Omit<HarnessEngine, 'stop' | 'clock'> & {clock: EngineClock}

export type EngineAddress = HarnessEngineAddress

export type StartedEngine = {engine: Engine; stop: () => Promise<void>; tick: () => Promise<void>}

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

export async function startEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<StartedEngine> {
  const plugins = config.plugins?.map((entry) => locatePlugin(entry, options.directory !== undefined))
  const {stop, clock, ...engine} = await createHarnessEngine(
    plugins === undefined ? config : {...config, plugins},
    options,
  )
  return {engine: {...engine, clock: {advance: clock.advance, drain: clock.drain}}, stop, tick: clock.tick}
}

export async function createEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<Engine> {
  const started = await startEngine(config, options)
  const onTestFinished = engineTests.getStore()
  if (onTestFinished === undefined) fileEngines.push(started.stop)
  else onTestFinished(started.stop)
  return started.engine
}
