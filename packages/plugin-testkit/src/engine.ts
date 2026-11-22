import {expect, onTestFinished} from 'vitest'
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

function locateTarget(target: string): string {
  return isSelector(target) ? target : pluginDirectory(target)
}

function locatePlugin(entry: PluginEntry): PluginEntry {
  if (typeof entry === 'string') return locateTarget(entry)
  return [locateTarget(entry[0]), entry[1]]
}

export async function startEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<StartedEngine> {
  const plugins = config.plugins?.map(locatePlugin)
  const {stop, clock, ...engine} = await createHarnessEngine(
    plugins === undefined ? config : {...config, plugins},
    options,
  )
  return {engine: {...engine, clock: {advance: clock.advance, drain: clock.drain}}, stop, tick: clock.tick}
}

export async function createEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<Engine> {
  const started = await startEngine(config, options)
  if (expect.getState().currentTestName !== undefined) onTestFinished(started.stop)
  else fileEngines.push(started.stop)
  return started.engine
}
