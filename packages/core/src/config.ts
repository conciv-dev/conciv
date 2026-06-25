import {CHAT_SYSTEM_PROMPT} from '@mandarax/harness/claude'
import type {MandaraxConfig} from '@mandarax/protocol/config-types'

// The public config contract lives in @mandarax/protocol; core owns only resolution.
export type {MandaraxConfig} from '@mandarax/protocol/config-types'
export {defineConfig} from '@mandarax/protocol/config-types'

export interface ResolvedMandaraxConfig {
  enabled: boolean
  widgetUrl: string | undefined
  previewId: string
  stateRoot: string
  harness: string
  harnessBin: string | undefined
  sessionId: string
  testRunner: string
  systemPrompt: string
  extensions: MandaraxConfig['extensions']
}

// systemPrompt: false → '' (opt out); string → custom; true/undefined → our minimal default.
function resolveSystemPrompt(value: string | boolean | undefined): string {
  if (value === false) return ''
  if (typeof value === 'string') return value
  return CHAT_SYSTEM_PROMPT
}

export function resolveConfig(options: MandaraxConfig, root: string): ResolvedMandaraxConfig {
  const env = process.env
  return {
    enabled: options.enabled ?? true,
    widgetUrl: options.widgetUrl ?? env.MANDARAX_WIDGET_URL,
    previewId: options.previewId ?? env.MANDARAX_PREVIEW_ID ?? 'local',
    stateRoot: options.stateRoot ?? env.MANDARAX_STATE_ROOT ?? root,
    harness: options.harness ?? env.MANDARAX_HARNESS ?? 'claude',
    harnessBin:
      options.harnessBin ?? options.claudePath ?? env.MANDARAX_HARNESS_BIN ?? env.MANDARAX_CLAUDE_PATH ?? undefined,
    sessionId:
      options.sessionId ?? options.claudeSessionId ?? env.MANDARAX_SESSION_ID ?? env.MANDARAX_CLAUDE_SESSION_ID ?? '',
    testRunner: options.testRunner ?? env.MANDARAX_TEST_RUNNER ?? 'vitest',
    systemPrompt: resolveSystemPrompt(options.systemPrompt),
    extensions: options.extensions,
  }
}
