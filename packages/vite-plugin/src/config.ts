import {CHAT_SYSTEM_PROMPT} from './chat-system-prompt.js'

// Public options for the devgent plugin. Everything is optional; sensible defaults are
// resolved against the vite project root and DEVGENT_* env vars (env is the fallback, the
// option always wins). No vendor-specific hosts, tokens, or ids leak in here.
export interface DevgentConfig {
  // Turn the agent on. Defaults to true; the plugin only applies in `serve` (dev) anyway.
  enabled?: boolean
  // URL of the injected widget bundle (e.g. served by the host app, or @devgent/widget).
  // When omitted, the HTTP surface still works but no UI is injected into the page.
  widgetUrl?: string
  // Correlates a persisted chat thread with a preview, so the SAME thread reopens across
  // dev-server restarts. Defaults to "local".
  previewId?: string
  // Where devgent keeps its state (.devgent/{claude.lock,chat-sessions.json,...}).
  // Defaults to the vite project root.
  lockDir?: string
  // The agent binary to spawn for each chat turn. Defaults to "claude".
  claudePath?: string
  // Resume an existing agent session on first load (e.g. a hand-off from another tool).
  claudeSessionId?: string
  // Appended to each agent turn so it knows it has live page/test access. Defaults to the
  // built-in devgent system prompt.
  systemPrompt?: string
}

export interface ResolvedDevgentConfig {
  enabled: boolean
  widgetUrl: string | undefined
  previewId: string
  lockDir: string
  claudePath: string
  claudeSessionId: string
  systemPrompt: string
}

export function resolveConfig(options: DevgentConfig, root: string): ResolvedDevgentConfig {
  const env = process.env
  return {
    enabled: options.enabled ?? true,
    widgetUrl: options.widgetUrl ?? env.DEVGENT_WIDGET_URL,
    previewId: options.previewId ?? env.DEVGENT_PREVIEW_ID ?? 'local',
    lockDir: options.lockDir ?? env.DEVGENT_LOCK_DIR ?? root,
    claudePath: options.claudePath ?? env.DEVGENT_CLAUDE_PATH ?? 'claude',
    claudeSessionId: options.claudeSessionId ?? env.DEVGENT_CLAUDE_SESSION_ID ?? '',
    systemPrompt: options.systemPrompt ?? CHAT_SYSTEM_PROMPT,
  }
}
