import {CHAT_SYSTEM_PROMPT} from '@conciv/harness/claude'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {
  isHarnessSessionId,
  isSessionId,
  type HarnessSessionId,
  type HubAccess,
  type SessionId,
} from '@conciv/protocol/chat-types'

export type {ConcivConfig} from '@conciv/protocol/config-types'
export {defineConfig} from '@conciv/protocol/config-types'

export interface ResolvedConcivConfig {
  enabled: boolean
  widgetUrl: string | undefined
  stateRoot: string
  harness: string
  harnessBin: string | undefined
  sessionId: SessionId | undefined
  harnessSessionId: HarnessSessionId | undefined
  systemPrompt: string
  hubAccess: HubAccess
  plugins: NonNullable<ConcivConfig['plugins']>
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

export function resolveConfig(options: ConcivConfig, root: string): ResolvedConcivConfig {
  const env = process.env
  return {
    enabled: options.enabled ?? true,
    widgetUrl: options.widgetUrl ?? env.CONCIV_WIDGET_URL,
    stateRoot: options.stateRoot ?? env.CONCIV_STATE_ROOT ?? root,
    harness: options.harness ?? env.CONCIV_HARNESS ?? 'claude',
    harnessBin:
      options.harnessBin ?? options.claudePath ?? env.CONCIV_HARNESS_BIN ?? env.CONCIV_CLAUDE_PATH ?? undefined,
    sessionId: resolveSessionId([options.sessionId, env.CONCIV_SESSION_ID]),
    harnessSessionId: resolveHarnessSessionId([options.claudeSessionId, env.CONCIV_CLAUDE_SESSION_ID]),
    systemPrompt: resolveSystemPrompt(options.systemPrompt),
    hubAccess: options.hubAccess ?? 'open',
    plugins: options.plugins ?? [],
  }
}
