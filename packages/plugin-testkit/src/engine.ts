import {existsSync, readFileSync} from 'node:fs'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import {expect, onTestFinished} from 'vitest'
import {z} from 'zod'
import {
  createHarnessEngine,
  quickHarness,
  type HarnessEngine,
  type HarnessEngineAddress,
  type HarnessEngineOptions,
  type HarnessEngineSession,
  type HarnessEngineSetting,
  type HarnessEngineTimings,
  type HarnessEngineTool,
  type HarnessEngineToolFailure,
  type QuickHarnessOptions,
  type TestLLM,
} from '@conciv/harness-testkit'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {disposeAll} from './dispose.js'

export type EngineSetting = HarnessEngineSetting

export type EngineHarness = QuickHarnessOptions

export type EngineTimings = HarnessEngineTimings

export type CreateEngineOptions = {
  plugins?: ConcivConfig['plugins']
  policies?: ConcivConfig['policies']
  harness?: HarnessEngineOptions['harness']
  harnesses?: readonly EngineHarness[]
  models?: HarnessEngineOptions['models']
  commands?: HarnessEngineOptions['commands']
  env?: Record<string, string>
  timings?: EngineTimings
  replies?: readonly TestLLM.Response[]
  fallback?: TestLLM.Response
  settings?: EngineSetting[]
  files?: Record<string, string>
  permission?: ConcivConfig['permission']
}

export type ToolFailure = HarnessEngineToolFailure

export type EngineTool = HarnessEngineTool

export type EngineSession = HarnessEngineSession

export type Engine = Omit<HarnessEngine, 'stop'>

export type EngineAddress = HarnessEngineAddress

export type EngineFiles = HarnessEngine['files']

export type StartedEngine = {engine: Engine; stop: () => Promise<void>}
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

function pluginDirectory(target: string): string {
  if (isAbsolute(target)) return target
  if (target.startsWith('.')) return resolve(target)
  return installedPlugin(target, process.cwd())
}

function locatePlugin(entry: PluginEntry): PluginEntry {
  if (typeof entry === 'string') return pluginDirectory(entry)
  return [pluginDirectory(entry[0]), entry[1]]
}

export async function startEngine(options: CreateEngineOptions): Promise<StartedEngine> {
  const {harness, replies, fallback, files, settings, permission, policies, models, commands, env, timings} = options
  const plugins = options.plugins?.map(locatePlugin)
  const {stop, ...engine} = await createHarnessEngine({
    harness,
    harnesses: options.harnesses?.map(quickHarness),
    models,
    commands,
    env,
    timings,
    config: {plugins, permission, policies},
    replies,
    fallback,
    files,
    settings,
  })
  return {engine, stop}
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<Engine> {
  const started = await startEngine(options)
  if (expect.getState().currentTestName !== undefined) onTestFinished(started.stop)
  else fileEngines.push(started.stop)
  return started.engine
}

export function engineAddress(engine: Engine): EngineAddress {
  return engine.address
}

export function stopFileEngines(): Promise<void> {
  return disposeAll(fileEngines.splice(0), 'sequential', 'an engine made at file level did not stop cleanly')
}
