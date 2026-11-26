import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import getPort from 'get-port'
import {z} from 'zod'
import {ConcivConfigSchema, type ConcivConfig} from '@conciv/types/config-types'
import {concivStateDir} from '@conciv/types/state-types'
import type * as Boot from './boot.js'

export const CONCIV_DEFAULT_PORT = 24170

export const WIDGET_START_SPECIFIER = '@conciv/widget-start'
const WIDGET_PORT_KEY = 'NEXT_PUBLIC_CONCIV_PORT'

type TurbopackConfig = {resolveAlias?: Record<string, unknown>; [key: string]: unknown}
type WebpackEntry = () => Promise<Record<string, unknown>>
type WebpackConfig = {entry?: WebpackEntry; resolve?: {alias?: Record<string, string | false>}}
type WebpackContext = {nextRuntime?: string; dev?: boolean; dir?: string; config?: {pageExtensions?: string[]}}
type WebpackHook = (config: WebpackConfig, context: WebpackContext) => WebpackConfig

type ConfigWithEnv = {
  env?: Record<string, string | undefined>
  serverExternalPackages?: string[]
  turbopack?: TurbopackConfig
  webpack?: WebpackHook
}

type WithConcivResult<T> = Omit<T, 'env' | 'serverExternalPackages' | 'turbopack' | 'webpack'> & {
  env: Record<string, string | undefined>
  serverExternalPackages: string[]
  turbopack?: TurbopackConfig
  webpack?: WebpackHook
}

const ENGINE_EXTERNALS = ['@conciv/it', '@conciv/unplugin', '@conciv/backend', '@conciv/home', '@conciv/harness']
const EDGE_REGISTER_ENTRIES = ['@conciv/it/plugin/nextjs', '@conciv/unplugin/nextjs']
const BOOT_FILE = './core/boot.js'

function findInstrumentationFile(dir: string, pageExtensions: string[]): string | undefined {
  const hasRootRoutes = existsSync(join(dir, 'app')) || existsSync(join(dir, 'pages'))
  const base = hasRootRoutes ? dir : join(dir, 'src')
  return pageExtensions.map((extension) => join(base, `instrumentation.${extension}`)).find(existsSync)
}

function compileInstrumentationFirst(config: WebpackConfig, context: WebpackContext): void {
  if (context.dev !== true || context.nextRuntime !== 'nodejs') return
  const {entry} = config
  if (entry === undefined || context.dir === undefined) return
  const file = findInstrumentationFile(context.dir, context.config?.pageExtensions ?? [])
  if (file === undefined) return
  config.entry = async () => ({
    ...(await entry()),
    instrumentation: {import: file, filename: 'instrumentation.js', layer: 'instrument'},
  })
}

const PROJECT_PORT_SPREAD = 1000
const ServerStateSchema = z.object({port: z.number().int().min(1).max(65535)})

async function readServerState(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

async function readRecordedPort(stateRoot: string): Promise<number | undefined> {
  const parsed = ServerStateSchema.safeParse(await readServerState(join(concivStateDir(stateRoot), 'server.json')))
  return parsed.success ? parsed.data.port : undefined
}

function projectPort(stateRoot: string): number {
  const digest = createHash('sha256').update(resolve(stateRoot)).digest()
  return CONCIV_DEFAULT_PORT + (digest.readUInt32BE(0) % PROJECT_PORT_SPREAD)
}

export async function chooseEnginePort(asked: number | undefined, stateRoot: string): Promise<number> {
  const preferred = asked ?? (await readRecordedPort(stateRoot)) ?? projectPort(stateRoot)
  return getPort({port: preferred})
}

function loadedEnginePort(): number | undefined {
  const loaded = process.env.CONCIV_OPTIONS
  if (loaded === undefined) return undefined
  return readConcivOptions(loaded).port
}

export async function withConciv<T extends object>(
  nextConfig: T = {} as T,
  options: ConcivConfig = {},
): Promise<WithConcivResult<T>> {
  const base = nextConfig as ConfigWithEnv
  const baseEnv = base.env ?? {}
  const baseExternals = base.serverExternalPackages ?? []
  const serverExternalPackages = [...new Set([...baseExternals, ...ENGINE_EXTERNALS])]
  if (options.enabled === false) return {...nextConfig, env: baseEnv, serverExternalPackages}
  const port = loadedEnginePort() ?? (await chooseEnginePort(options.port, options.stateRoot ?? process.cwd()))
  const resolved: ConcivConfig = {...options, port}
  const widgetOff = options.widget === false
  const widgetEnv = widgetOff ? {} : {[WIDGET_PORT_KEY]: String(port)}
  const concivEnv = {...widgetEnv, CONCIV_OPTIONS: JSON.stringify(resolved)}
  const userEnv = widgetOff
    ? Object.fromEntries(Object.entries(baseEnv).filter(([key]) => key !== WIDGET_PORT_KEY))
    : baseEnv
  if (widgetOff) Reflect.deleteProperty(process.env, WIDGET_PORT_KEY)
  for (const [key, value] of Object.entries(concivEnv)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  const userWebpack = base.webpack
  const webpack: WebpackHook = (config, context) => {
    const resolveConfig = config.resolve ?? {}
    const alias: Record<string, string | false> = {...resolveConfig.alias}
    if (context.nextRuntime === 'edge') for (const entry of EDGE_REGISTER_ENTRIES) alias[entry] = false
    resolveConfig.alias = alias
    config.resolve = resolveConfig
    compileInstrumentationFirst(config, context)
    return userWebpack ? userWebpack(config, context) : config
  }
  return {
    ...nextConfig,
    env: {...userEnv, ...concivEnv},
    serverExternalPackages,
    turbopack: {...base.turbopack},
    webpack,
  }
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const options = readConcivOptions(process.env.CONCIV_OPTIONS ?? '{}')
  if (options.enabled === false) return
  const boot: typeof Boot = await importBesideEntry(BOOT_FILE)
  await boot.makeEngineBooter(options, process.cwd(), {})()
}

function importBesideEntry(file: string) {
  return import(/* webpackIgnore: true */ new URL(file, new URL(import.meta.url)).href)
}

function readConcivOptions(text: string): ConcivConfig {
  const parsed = ConcivConfigSchema.safeParse(parseJson(text))
  if (parsed.success) return parsed.data
  throw new Error(`conciv: CONCIV_OPTIONS is not a valid conciv config: ${parsed.error.message}`)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('conciv: CONCIV_OPTIONS is not JSON', {cause: error})
  }
}
