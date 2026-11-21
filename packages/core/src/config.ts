import {CHAT_SYSTEM_PROMPT} from '@conciv/harness/claude/system-prompt'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {
  isHarnessSessionId,
  isSessionId,
  type HarnessSessionId,
  type HubAccess,
  type SessionId,
} from '@conciv/protocol/chat-types'
import {Config, type ConfigProvider, Effect, Option} from 'effect'
import {defaultConfigProvider} from './lib/default-config-provider.js'

export type {ConcivConfig} from '@conciv/protocol/config-types'
export {defineConfig} from '@conciv/protocol/config-types'

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
    throw new Error(`the configured conciv session id "${declared}" is not a conciv session id (conciv_...)`)
  }
  return declared
}

function resolveHarnessSessionId(candidates: (string | undefined)[]): HarnessSessionId | undefined {
  const declared = declaredValue(candidates)
  if (declared === undefined) return undefined
  if (!isHarnessSessionId(declared)) {
    throw new Error(
      `the configured harness session id "${declared}" is not a harness session id (up to 128 characters of A-Z, a-z, 0-9, "_" and "-")`,
    )
  }
  return declared
}

function resolveSystemPrompt(value: string | boolean | undefined): string {
  if (value === false) return ''
  if (typeof value === 'string') return value
  return CHAT_SYSTEM_PROMPT
}

function envValue(name: string): Config.Config<string | undefined> {
  return Config.option(Config.String(name)).pipe(Config.map(Option.getOrUndefined))
}

const EnvFallbacksConfig = Config.all({
  CONCIV_STATE_ROOT: envValue('CONCIV_STATE_ROOT'),
  CONCIV_HARNESS: envValue('CONCIV_HARNESS'),
  CONCIV_SESSION_ID: envValue('CONCIV_SESSION_ID'),
  CONCIV_CLAUDE_SESSION_ID: envValue('CONCIV_CLAUDE_SESSION_ID'),
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
  }
}
