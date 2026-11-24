import {
  createHarnessEngine,
  type HarnessEngine,
  type HarnessEngineAddress,
  type EngineStart,
  type HarnessEngineClock,
  type HarnessEngineSession,
  type HarnessEngineSetting,
  type HarnessEngineToolFailure,
} from '@conciv/core/testing'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {ConcivConfig} from '@conciv/protocol/config-types'

export type EngineSetting = HarnessEngineSetting

export type {EngineStart}

export type ToolFailure = HarnessEngineToolFailure

export type EngineSession = HarnessEngineSession

export type EngineClock = Omit<HarnessEngineClock, 'tick'>

export type Engine = Omit<HarnessEngine, 'stop' | 'clock'> & {clock: EngineClock}

export type EngineAddress = HarnessEngineAddress

export type StartedEngine = {engine: Engine; stop: () => Promise<void>; tick: () => Promise<void>}

type PluginEntry = NonNullable<ConcivConfig['plugins']>[number]

const PLUGIN_FOLDERS: Readonly<Record<string, string>> = {
  '@conciv/plugin-page': import.meta.resolve('@conciv/plugin-page/package.json'),
  '@conciv/plugin-recorder': import.meta.resolve('@conciv/plugin-recorder/package.json'),
  '@conciv/plugin-tanstack': import.meta.resolve('@conciv/plugin-tanstack/package.json'),
  '@conciv/plugin-terminal': import.meta.resolve('@conciv/plugin-terminal/package.json'),
  '@conciv/plugin-whiteboard': import.meta.resolve('@conciv/plugin-whiteboard/package.json'),
}

function pluginFolder(name: string): string {
  const manifest = PLUGIN_FOLDERS[name]
  return manifest === undefined ? name : dirname(fileURLToPath(manifest))
}

function located(entry: PluginEntry): PluginEntry {
  return typeof entry === 'string' ? pluginFolder(entry) : [pluginFolder(entry[0]), entry[1]]
}

export async function startEngine(config: ConcivConfig = {}, options: EngineStart = {}): Promise<StartedEngine> {
  const {stop, clock, ...engine} = await createHarnessEngine(
    {...config, ...(config.plugins === undefined ? {} : {plugins: config.plugins.map(located)})},
    {...options, ...(options.post === undefined ? {} : {post: options.post.map(pluginFolder)})},
  )
  return {engine: {...engine, clock: {advance: clock.advance, drain: clock.drain}}, stop, tick: clock.tick}
}
