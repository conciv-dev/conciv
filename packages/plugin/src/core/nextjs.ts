import {existsSync} from 'node:fs'
import {join} from 'node:path'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {Builtins} from '@conciv/extension-compiler/extensions'
import {HUB_PATH} from './dev-server-hub.js'
import {writeExtensionsEntry} from './extensions-entry.js'

export const CONCIV_DEFAULT_PORT = 41700

const APP_EXTENSIONS_SPECIFIER = '@conciv/app-extensions'
const ENTRY_RELATIVE = './.conciv/extensions-client.gen.tsx'

type TurbopackConfig = {resolveAlias?: Record<string, unknown>; [key: string]: unknown}
type WebpackEntry = () => Promise<Record<string, unknown>>
type WebpackConfig = {entry?: WebpackEntry; resolve?: {alias?: Record<string, string | false>}}
type WebpackContext = {nextRuntime?: string; dev?: boolean; dir?: string; config?: {pageExtensions?: string[]}}
type WebpackHook = (config: WebpackConfig, context: WebpackContext) => WebpackConfig

type HostCondition = {type: 'header'; key: 'host'; value: string}
type Route = {source: string; destination: string; has?: HostCondition[]}
type RedirectRoute = Route & {permanent: boolean}
type RewriteTable = {beforeFiles?: Route[]; afterFiles?: Route[]; fallback?: Route[]}

type ConfigWithEnv = {
  env?: Record<string, string | undefined>
  serverExternalPackages?: string[]
  turbopack?: TurbopackConfig
  webpack?: WebpackHook
  rewrites?: () => Promise<Route[] | RewriteTable>
  redirects?: () => Promise<RedirectRoute[]>
  skipTrailingSlashRedirect?: boolean
}

type WithConcivResult<T> = Omit<
  T,
  'env' | 'serverExternalPackages' | 'turbopack' | 'webpack' | 'rewrites' | 'redirects' | 'skipTrailingSlashRedirect'
> & {
  env: Record<string, string | undefined>
  serverExternalPackages: string[]
  turbopack?: TurbopackConfig
  webpack?: WebpackHook
  rewrites?: () => Promise<RewriteTable>
  redirects?: () => Promise<RedirectRoute[]>
  skipTrailingSlashRedirect?: boolean
}

const LOOPBACK_HOST: HostCondition = {
  type: 'header',
  key: 'host',
  value: '(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?',
}

const TRAILING_SLASH_REDIRECT: RedirectRoute = {
  source: `/:path((?!${HUB_PATH.slice(1)}/).+)/`,
  destination: '/:path',
  permanent: true,
}

function forwardHub(
  base: ConfigWithEnv,
  port: string,
): Pick<ConfigWithEnv, 'redirects' | 'skipTrailingSlashRedirect'> & {rewrites: () => Promise<RewriteTable>} {
  const hub: Route = {
    source: `${HUB_PATH}/:path*`,
    destination: `http://127.0.0.1:${port}${HUB_PATH}/:path*`,
    has: [LOOPBACK_HOST],
  }
  return {
    skipTrailingSlashRedirect: true,
    redirects: async () => [
      ...(base.skipTrailingSlashRedirect ? [] : [TRAILING_SLASH_REDIRECT]),
      ...((await base.redirects?.()) ?? []),
    ],
    rewrites: async () => {
      const user = (await base.rewrites?.()) ?? []
      if (Array.isArray(user)) return {beforeFiles: [hub], afterFiles: user}
      return {...user, beforeFiles: [hub, ...(user.beforeFiles ?? [])]}
    },
  }
}

const ENGINE_EXTERNALS = ['@conciv/it', '@conciv/plugin', '@conciv/core', '@conciv/db', '@conciv/harness']
const EDGE_REGISTER_ENTRIES = ['@conciv/it/plugin/nextjs', '@conciv/plugin/nextjs']

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
  const concivEnv = {
    NEXT_PUBLIC_CONCIV_PORT: String(port),
    CONCIV_OPTIONS: JSON.stringify(resolved),
  }
  for (const [key, value] of Object.entries(concivEnv)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  const effectivePort = process.env.NEXT_PUBLIC_CONCIV_PORT ?? concivEnv.NEXT_PUBLIC_CONCIV_PORT
  const generated = writeExtensionsEntry(process.cwd())
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
    env: {...baseEnv, ...concivEnv, NEXT_PUBLIC_CONCIV_PORT: effectivePort},
    serverExternalPackages,
    turbopack,
    webpack,
    ...forwardHub(base, effectivePort),
  }
}

export async function registerWith(loadBuiltins: () => Promise<Builtins>): Promise<void> {
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
  const builtins = await loadBuiltins()
  await makeEngineBooter(options, root, builtins, 'exact')()
}

export async function register(): Promise<void> {
  await registerWith(async () => {
    const {NO_BUILTINS} = await import('@conciv/extension-compiler/extensions')
    return NO_BUILTINS
  })
}
