import type {ConcivConfig} from '@conciv/protocol/config-types'

export const CONCIV_DEFAULT_PORT = 41700

type ConfigWithEnv = {env?: Record<string, string | undefined>; serverExternalPackages?: string[]}

const ENGINE_EXTERNALS = ['@conciv/it', '@conciv/plugin', '@conciv/core', '@conciv/db', '@conciv/harness']

function workspaceBootUrl(): string | undefined {
  const url = import.meta.resolve('./nextjs-boot.js')
  return url.includes('/node_modules/') ? undefined : url
}

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
  const bootUrl = workspaceBootUrl()
  const concivEnv = {
    NEXT_PUBLIC_CONCIV_PORT: String(port),
    CONCIV_OPTIONS: JSON.stringify(resolved),
    ...(bootUrl === undefined ? {} : {CONCIV_BOOT_URL: bootUrl}),
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
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const {registerNode} = await import('./register-node.js')
  await registerNode()
}
