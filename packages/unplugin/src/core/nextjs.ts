import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {ConcivConfigSchema, type ConcivConfig} from '@conciv/protocol/config-types'
import {writeExtensionsEntry} from './extensions-entry.js'
import type * as Boot from './boot.js'
import type * as ExtensionsWatch from './extensions-watch.js'

export const CONCIV_DEFAULT_PORT = 24170

export const APP_EXTENSIONS_SPECIFIER = '@conciv/app-extensions'
export const WIDGET_START_SPECIFIER = '@conciv/widget-start'
const ENTRY_RELATIVE = './.conciv/extensions-client.gen.tsx'
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

const ENGINE_EXTERNALS = ['@conciv/it', '@conciv/unplugin', '@conciv/core', '@conciv/db', '@conciv/harness']
const EDGE_REGISTER_ENTRIES = ['@conciv/it/plugin/nextjs', '@conciv/unplugin/nextjs']
const EXTENSIONS_WATCH_FILE = './core/extensions-watch.js'
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

export function withConciv<T extends object>(nextConfig: T = {} as T, options: ConcivConfig = {}): WithConcivResult<T> {
  const base = nextConfig as ConfigWithEnv
  const baseEnv = base.env ?? {}
  const baseExternals = base.serverExternalPackages ?? []
  const serverExternalPackages = [...new Set([...baseExternals, ...ENGINE_EXTERNALS])]
  if (options.enabled === false) return {...nextConfig, env: baseEnv, serverExternalPackages}
  const port = options.port ?? CONCIV_DEFAULT_PORT
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
  const generated = writeExtensionsEntry(process.cwd(), listClientEntries(options))
  const baseTurbopack = base.turbopack ?? {}
  const turbopack: TurbopackConfig = {
    ...baseTurbopack,
    resolveAlias: {...baseTurbopack.resolveAlias, [APP_EXTENSIONS_SPECIFIER]: ENTRY_RELATIVE},
  }
  const userWebpack = base.webpack
  const webpack: WebpackHook = (config, context) => {
    const resolveConfig = config.resolve ?? {}
    const alias: Record<string, string | false> = {...resolveConfig.alias, [APP_EXTENSIONS_SPECIFIER]: generated.path}
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
    turbopack,
    webpack,
  }
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const options = readConcivOptions(process.env.CONCIV_OPTIONS ?? '{}')
  if (options.enabled === false) return
  const root = process.cwd()
  try {
    const extensionsWatch: typeof ExtensionsWatch = await importBesideEntry(EXTENSIONS_WATCH_FILE)
    extensionsWatch.watchExtensionsDir(root, listClientEntries(options))
  } catch (error) {
    console.error('conciv: failed to start extensions watcher', error)
  }
  const boot: typeof Boot = await importBesideEntry(BOOT_FILE)
  await boot.makeEngineBooter(options, root, {}, 'exact')()
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

function listClientEntries(options: ConcivConfig): string[] {
  return (options.extensions ?? []).map((extension) => extension.client)
}
