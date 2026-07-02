import type {ConcivConfig} from '@conciv/protocol/config-types'

export const CONCIV_DEFAULT_PORT = 41700

type ConfigWithEnv = {env?: Record<string, string | undefined>}

export function withConciv<T extends object>(
  nextConfig: T = {} as T,
  options: ConcivConfig = {},
): T & {env: Record<string, string | undefined>} {
  const baseEnv = (nextConfig as ConfigWithEnv).env ?? {}
  if (options.enabled === false) return {...nextConfig, env: baseEnv}
  const port = options.port ?? CONCIV_DEFAULT_PORT
  const resolved: ConcivConfig = {...options, port}
  const concivEnv = {
    NEXT_PUBLIC_CONCIV_PORT: String(port),
    CONCIV_OPTIONS: JSON.stringify(resolved),
  }
  process.env.NEXT_PUBLIC_CONCIV_PORT ??= concivEnv.NEXT_PUBLIC_CONCIV_PORT
  process.env.CONCIV_OPTIONS ??= concivEnv.CONCIV_OPTIONS
  return {
    ...nextConfig,
    env: {...baseEnv, ...concivEnv},
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
