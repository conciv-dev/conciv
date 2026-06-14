import {CHAT_SYSTEM_PROMPT} from '@aidx/harness/claude'
import type {AidxConfig} from '@aidx/protocol/config-types'

// The public config contract lives in @aidx/protocol; core owns only resolution.
export type {AidxConfig} from '@aidx/protocol/config-types'
export {defineConfig} from '@aidx/protocol/config-types'

export interface ResolvedAidxConfig {
  enabled: boolean
  widgetUrl: string | undefined
  previewId: string
  lockDir: string
  harness: string
  harnessBin: string | undefined
  sessionId: string
  testRunner: string
  systemPrompt: string
}

export function resolveConfig(options: AidxConfig, root: string): ResolvedAidxConfig {
  const env = process.env
  return {
    enabled: options.enabled ?? true,
    widgetUrl: options.widgetUrl ?? env.AIDX_WIDGET_URL,
    previewId: options.previewId ?? env.AIDX_PREVIEW_ID ?? 'local',
    lockDir: options.lockDir ?? env.AIDX_LOCK_DIR ?? root,
    harness: options.harness ?? env.AIDX_HARNESS ?? 'claude',
    harnessBin:
      options.harnessBin ?? options.claudePath ?? env.AIDX_HARNESS_BIN ?? env.AIDX_CLAUDE_PATH ?? undefined,
    sessionId:
      options.sessionId ?? options.claudeSessionId ?? env.AIDX_SESSION_ID ?? env.AIDX_CLAUDE_SESSION_ID ?? '',
    testRunner: options.testRunner ?? env.AIDX_TEST_RUNNER ?? 'vitest',
    systemPrompt: options.systemPrompt ?? CHAT_SYSTEM_PROMPT,
  }
}
