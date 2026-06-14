// The public aidx config contract, shared by the engine + every plugin entry. Zero-runtime:
// the type + an identity typed factory (mirrors defineHarness/defineRunner). Resolution + env
// fallbacks live in @aidx/core/config.
export interface AidxConfig {
  enabled?: boolean
  widgetUrl?: string
  previewId?: string
  stateRoot?: string
  harness?: string
  harnessBin?: string
  sessionId?: string
  testRunner?: string
  /** Fixed engine port. Used by the Next.js integration so server boot + client widget agree. */
  port?: number
  systemPrompt?: string
  /** @deprecated use harnessBin */ claudePath?: string
  /** @deprecated use sessionId */ claudeSessionId?: string
}

export function defineConfig<T extends AidxConfig>(config: T): T {
  return config
}
