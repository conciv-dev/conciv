import type {ConcivConfig} from '@conciv/protocol/config-types'
import {writeExtensionsEntry} from './extensions-entry.js'

export const CONCIV_DEFAULT_PORT = 41700

const APP_EXTENSIONS_SPECIFIER = '@conciv/app-extensions'
const ENTRY_RELATIVE = './.conciv/extensions-client.gen.tsx'

type TurbopackConfig = {resolveAlias?: Record<string, unknown>; [key: string]: unknown}
type WebpackConfig = {resolve?: {alias?: Record<string, string>}}
type WebpackHook = (config: WebpackConfig, context: unknown) => WebpackConfig

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

const ENGINE_EXTERNALS = ['@conciv/it', '@conciv/plugin', '@conciv/core', '@conciv/db', '@conciv/harness']

export function withConciv<T extends object>(nextConfig: T = {} as T, options: ConcivConfig = {}): WithConcivResult<T> {
  const base = nextConfig as ConfigWithEnv
  const baseEnv = base.env ?? {}
  const baseExternals = base.serverExternalPackages ?? []
  const serverExternalPackages = [...new Set([...baseExternals, ...ENGINE_EXTERNALS])]
  if (options.enabled === false) return {...nextConfig, env: baseEnv, serverExternalPackages}
  const port = options.port ?? CONCIV_DEFAULT_PORT
  const resolved: ConcivConfig = {...options, port}
  const concivEnv = {
    NEXT_PUBLIC_CONCIV_PORT: String(port),
    CONCIV_OPTIONS: JSON.stringify(resolved),
  }
  for (const [key, value] of Object.entries(concivEnv)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  const generated = writeExtensionsEntry(process.cwd())
  const baseTurbopack = base.turbopack ?? {}
  const turbopack: TurbopackConfig = {
    ...baseTurbopack,
    resolveAlias: {...baseTurbopack.resolveAlias, [APP_EXTENSIONS_SPECIFIER]: ENTRY_RELATIVE},
  }
  const userWebpack = base.webpack
  const webpack: WebpackHook = (config, context) => {
    const resolveConfig = config.resolve ?? {}
    resolveConfig.alias = {...resolveConfig.alias, [APP_EXTENSIONS_SPECIFIER]: generated.path}
    config.resolve = resolveConfig
    return userWebpack ? userWebpack(config, context) : config
  }
  return {
    ...nextConfig,
    env: {...baseEnv, ...concivEnv},
    serverExternalPackages,
    turbopack,
    webpack,
  }
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const options = JSON.parse(process.env.CONCIV_OPTIONS ?? '{}') as ConcivConfig
  if (options.enabled === false) return
  const root = process.cwd()
  try {
    const {watchExtensionsDir} = await import('./extensions-watch.js')
    watchExtensionsDir(root)
  } catch (error) {
    console.error('conciv: failed to start extensions watcher', error)
  }
  const {makeEngineBooter} = await import('./boot.js')
  const {NO_BUILTINS} = await import('@conciv/extension-compiler/extensions')
  await makeEngineBooter(options, root, NO_BUILTINS)()
}
