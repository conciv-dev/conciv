import type {ConcivConfig} from '@conciv/protocol/config-types'

export const CONCIV_DEFAULT_PORT = 41700

type ConfigWithEnv = {env?: Record<string, string | undefined>; serverExternalPackages?: string[]}

const ENGINE_EXTERNALS = ['@conciv/it', '@conciv/plugin', '@conciv/core', '@conciv/db', '@conciv/harness']

export function withConciv<T extends object>(
  nextConfig: T = {} as T,
  options: ConcivConfig = {},
): T & {env: Record<string, string | undefined>; serverExternalPackages: string[]} {
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
  return {
    ...nextConfig,
    env: {...baseEnv, ...concivEnv},
    serverExternalPackages,
  }
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const options = JSON.parse(process.env.CONCIV_OPTIONS ?? '{}') as ConcivConfig
    if (options.enabled === false) return
    const {makeEngineBooter} = await import('./boot.js')
    const {NO_BUILTINS} = await import('./extensions.js')
    await makeEngineBooter(options, process.cwd(), NO_BUILTINS)()
  }
}
