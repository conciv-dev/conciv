import {CHAT_SYSTEM_PROMPT} from '@opendui/aidx-harness/claude'
import type {AidxConfig} from '@opendui/aidx-protocol/config-types'

// The public config contract lives in @opendui/aidx-protocol; core owns only resolution.
export type {AidxConfig} from '@opendui/aidx-protocol/config-types'
export {defineConfig} from '@opendui/aidx-protocol/config-types'

export interface ResolvedAidxConfig {
  enabled: boolean
  widgetUrl: string | undefined
  previewId: string
  stateRoot: string
  harness: string
  harnessBin: string | undefined
  sessionId: string
  testRunner: string
  systemPrompt: string
}

// systemPrompt: false → '' (opt out); string → custom; true/undefined → our minimal default.
function resolveSystemPrompt(value: string | boolean | undefined): string {
  if (value === false) return ''
  if (typeof value === 'string') return value
  return CHAT_SYSTEM_PROMPT
}

export function resolveConfig(options: AidxConfig, root: string): ResolvedAidxConfig {
  const env = process.env
  return {
    enabled: options.enabled ?? true,
    widgetUrl: options.widgetUrl ?? env.AIDX_WIDGET_URL,
    previewId: options.previewId ?? env.AIDX_PREVIEW_ID ?? 'local',
    stateRoot: options.stateRoot ?? env.AIDX_STATE_ROOT ?? root,
    harness: options.harness ?? env.AIDX_HARNESS ?? 'claude',
    harnessBin: options.harnessBin ?? options.claudePath ?? env.AIDX_HARNESS_BIN ?? env.AIDX_CLAUDE_PATH ?? undefined,
    sessionId: options.sessionId ?? options.claudeSessionId ?? env.AIDX_SESSION_ID ?? env.AIDX_CLAUDE_SESSION_ID ?? '',
    testRunner: options.testRunner ?? env.AIDX_TEST_RUNNER ?? 'vitest',
    systemPrompt: resolveSystemPrompt(options.systemPrompt),
  }
}
