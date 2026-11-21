import {existsSync, readFileSync} from 'node:fs'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import {expect, onTestFinished} from 'vitest'
import {z} from 'zod'
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
import {disposeAll} from './dispose.js'

export type EngineSetting = HarnessEngineSetting

export type {EngineStart}

export type ToolFailure = HarnessEngineToolFailure

export type EngineTool = HarnessEngineTool

export type EngineSession = HarnessEngineSession

export type EngineClock = Omit<HarnessEngineClock, 'tick'>

export type Engine = Omit<HarnessEngine, 'stop' | 'clock'> & {clock: EngineClock}

export type EngineAddress = HarnessEngineAddress

export type StartedEngine = {engine: Engine; stop: () => Promise<void>; tick: () => Promise<void>}

const fileEngines: Array<() => Promise<void>> = []

type PluginEntry = NonNullable<ConcivConfig['plugins']>[number]

const ManifestNameSchema = z.object({name: z.string().optional()})

function packageNamed(name: string, directory: string): boolean {
  const manifest = join(directory, 'package.json')
  if (!existsSync(manifest)) return false
  return ManifestNameSchema.parse(JSON.parse(readFileSync(manifest, 'utf8'))).name === name
}

function installedPlugin(name: string, directory: string): string {
  if (packageNamed(name, directory)) return directory
  const installed = join(directory, 'node_modules', name)
  if (existsSync(join(installed, 'package.json'))) return installed
  const parent = dirname(directory)
  if (parent === directory) throw new Error(`the plugin ${name} is not installed in the package under test`)
  return installedPlugin(name, parent)
}

export function pluginDirectory(target: string): string {
  if (isAbsolute(target)) return target
  if (target.startsWith('.')) return resolve(target)
  return installedPlugin(target, process.cwd())
}

function locatePlugin(entry: PluginEntry): PluginEntry {
  if (typeof entry === 'string') return pluginDirectory(entry)
  return [pluginDirectory(entry[0]), entry[1]]
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

export function stopFileEngines(): Promise<void> {
  return disposeAll(fileEngines.splice(0), 'sequential', 'an engine made at file level did not stop cleanly')
}
