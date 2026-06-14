import type {AidxConfig} from '@aidx/protocol/config-types'

// Next owns HTML rendering, so aidx integrates via conventions, not a bundler hook:
// withAidx pins a fixed engine port and inlines it for the client; register() boots the engine.
export const AIDX_DEFAULT_PORT = 41700

// The only field we read off a Next config; cast in to read it without constraining the generic
// to a weak type (which would reject configs that don't declare `env`).
type ConfigWithEnv = {env?: Record<string, string | undefined>}

// Wrap next.config: pin the engine port, inline it for the client, carry options for register().
export function withAidx<T extends object>(
  nextConfig: T = {} as T,
  options: AidxConfig = {},
): T & {env: Record<string, string | undefined>} {
  const baseEnv = (nextConfig as ConfigWithEnv).env ?? {}
  if (options.enabled === false) return {...nextConfig, env: baseEnv}
  const port = options.port ?? AIDX_DEFAULT_PORT
  const resolved: AidxConfig = {...options, port}
  return {
    ...nextConfig,
    env: {
      ...baseEnv,
      NEXT_PUBLIC_AIDX_PORT: String(port),
      AIDX_OPTIONS: JSON.stringify(resolved),
    },
  }
}

// Server-startup hook for instrumentation.ts. Node runtime + dev only; boots the engine once.
// The node-only boot import lives inside the NEXT_RUNTIME==='nodejs' block so Next dead-code-
// eliminates it from the edge instrumentation bundle (the Sentry idiom).
export async function register(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const options = JSON.parse(process.env.AIDX_OPTIONS ?? '{}') as AidxConfig
    if (options.enabled === false) return
    const {makeEngineBooter} = await import('./boot.js')
    await makeEngineBooter(options, process.cwd())()
  }
}
