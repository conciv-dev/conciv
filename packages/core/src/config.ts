import {CHAT_SYSTEM_PROMPT} from '@conciv/harness/claude'
import type {ConcivConfig} from '@conciv/protocol/config-types'

export type {ConcivConfig} from '@conciv/protocol/config-types'
export {defineConfig} from '@conciv/protocol/config-types'

export interface ResolvedConcivConfig {
  enabled: boolean
  widgetUrl: string | undefined
  stateRoot: string
  harness: string
  harnessBin: string | undefined
  sessionId: string
  systemPrompt: string
  extensions: ConcivConfig['extensions']
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
    sessionId:
      options.sessionId ?? options.claudeSessionId ?? env.CONCIV_SESSION_ID ?? env.CONCIV_CLAUDE_SESSION_ID ?? '',
    systemPrompt: resolveSystemPrompt(options.systemPrompt),
    extensions: options.extensions,
  }
}
