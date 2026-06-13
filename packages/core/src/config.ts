import {CHAT_SYSTEM_PROMPT} from '@devgent/harness/claude'
import type {DevgentConfig} from '@devgent/protocol/config-types'

// The public config contract lives in @devgent/protocol; core owns only resolution.
export type {DevgentConfig} from '@devgent/protocol/config-types'
export {defineConfig} from '@devgent/protocol/config-types'

export interface ResolvedDevgentConfig {
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

export function resolveConfig(options: DevgentConfig, root: string): ResolvedDevgentConfig {
  const env = process.env
  return {
    enabled: options.enabled ?? true,
    widgetUrl: options.widgetUrl ?? env.DEVGENT_WIDGET_URL,
    previewId: options.previewId ?? env.DEVGENT_PREVIEW_ID ?? 'local',
    lockDir: options.lockDir ?? env.DEVGENT_LOCK_DIR ?? root,
    harness: options.harness ?? env.DEVGENT_HARNESS ?? 'claude',
    harnessBin:
      options.harnessBin ?? options.claudePath ?? env.DEVGENT_HARNESS_BIN ?? env.DEVGENT_CLAUDE_PATH ?? undefined,
    sessionId:
      options.sessionId ?? options.claudeSessionId ?? env.DEVGENT_SESSION_ID ?? env.DEVGENT_CLAUDE_SESSION_ID ?? '',
    testRunner: options.testRunner ?? env.DEVGENT_TEST_RUNNER ?? 'vitest',
    systemPrompt: options.systemPrompt ?? CHAT_SYSTEM_PROMPT,
  }
}
