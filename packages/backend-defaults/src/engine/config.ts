import {CHAT_SYSTEM_PROMPT} from './lib/chat-system-prompt.js'
import {
  parseRetention,
  readLogLevel,
  type ConcivConfig,
  type LogLevel,
  type Retention,
} from '@conciv/types/config-types'
import {
  isHarnessSessionId,
  isSessionId,
  type HarnessSessionId,
  type HubAccess,
  type SessionId,
} from '@conciv/types/chat-types'
import {Config, type ConfigProvider, Effect, Option, Result} from 'effect'
import {defaultConfigProvider} from './lib/default-config-provider.js'
import {engineErrors} from './lib/errors.js'
import {observabilityErrors} from '../util/observability/errors.js'

export type {ConcivConfig} from '@conciv/types/config-types'
export {defineConfig} from '@conciv/types/config-types'

export interface ResolvedConcivConfig {
  enabled: boolean
  stateRoot: string
  harness: string
  sessionId: SessionId | undefined
  harnessSessionId: HarnessSessionId | undefined
  systemPrompt: string
  hubAccess: HubAccess
  plugins: NonNullable<ConcivConfig['plugins']>
  policies: NonNullable<ConcivConfig['policies']>
  permissions: NonNullable<ConcivConfig['permissions']>
  logLevel: LogLevel
  logRetention: Retention
  simulate: boolean
}

function shortPermissions(permission: ConcivConfig['permission']): NonNullable<ConcivConfig['permissions']> {
  if (permission === undefined) return []
  if (typeof permission === 'string') return [{action: '*', resource: '*', effect: permission}]
  return Object.entries(permission).flatMap(([action, value]) =>
    typeof value === 'string'
      ? [{action, resource: '*', effect: value}]
      : Object.entries(value).map(([resource, effect]) => ({action, resource, effect})),
  )
}

function declaredValue(candidates: (string | undefined)[]): string | undefined {
  return candidates.find((candidate) => candidate !== undefined && candidate !== '')
}

function resolveSessionId(candidates: (string | undefined)[]): SessionId | undefined {
  const declared = declaredValue(candidates)
  if (declared === undefined) return undefined
  if (!isSessionId(declared)) {
    throw engineErrors.SESSION_ID_INVALID({declared})
  }
  return declared
}

function resolveHarnessSessionId(candidates: (string | undefined)[]): HarnessSessionId | undefined {
  const declared = declaredValue(candidates)
  if (declared === undefined) return undefined
  if (!isHarnessSessionId(declared)) {
    throw engineErrors.HARNESS_SESSION_ID_INVALID({declared})
  }
  return declared
}

function resolveSystemPrompt(value: string | boolean | undefined): string {
  if (value === false) return ''
  if (typeof value === 'string') return value
  return CHAT_SYSTEM_PROMPT
}

function resolveRetention(value: string | undefined): Retention {
  const parsed = parseRetention(value ?? '7d')
  if (Result.isFailure(parsed)) throw observabilityErrors.LOG_RETENTION_INVALID({reason: parsed.failure})
  return parsed.success
}

function envValue(name: string): Config.Config<string | undefined> {
  return Config.option(Config.String(name)).pipe(Config.map(Option.getOrUndefined))
}

const EnvFallbacksConfig = Config.all({
  CONCIV_STATE_ROOT: envValue('CONCIV_STATE_ROOT'),
  CONCIV_HARNESS: envValue('CONCIV_HARNESS'),
  CONCIV_SESSION_ID: envValue('CONCIV_SESSION_ID'),
  CONCIV_CLAUDE_SESSION_ID: envValue('CONCIV_CLAUDE_SESSION_ID'),
  CONCIV_LOG_LEVEL: envValue('CONCIV_LOG_LEVEL'),
  CONCIV_SIMULATE: Config.Boolean('CONCIV_SIMULATE').pipe(Config.withDefault(false)),
})

export function resolveConfig(
  options: ConcivConfig,
  root: string,
  configProvider: ConfigProvider.ConfigProvider = defaultConfigProvider(),
): ResolvedConcivConfig {
  const env = Effect.runSync(EnvFallbacksConfig.parse(configProvider))
  return {
    enabled: options.enabled ?? true,
    stateRoot: options.stateRoot ?? env.CONCIV_STATE_ROOT ?? root,
    harness: options.harness ?? env.CONCIV_HARNESS ?? 'claude',
    sessionId: resolveSessionId([options.sessionId, env.CONCIV_SESSION_ID]),
    harnessSessionId: resolveHarnessSessionId([options.claudeSessionId, env.CONCIV_CLAUDE_SESSION_ID]),
    systemPrompt: resolveSystemPrompt(options.systemPrompt),
    hubAccess: options.hubAccess ?? 'open',
    plugins: options.plugins ?? [],
    policies: options.policies ?? [],
    permissions: [...shortPermissions(options.permission), ...(options.permissions ?? [])],
    logLevel: readLogLevel({env: env.CONCIV_LOG_LEVEL, config: options.logLevel}),
    logRetention: resolveRetention(options.logRetention),
    simulate: env.CONCIV_SIMULATE,
  }
}
