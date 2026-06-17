// The public aidx config contract, shared by the engine + every plugin entry. Zero-runtime:
// the type + an identity typed factory (mirrors defineHarness/defineRunner). Resolution + env
// fallbacks live in @opendui/aidx-core/config.
// Where the corner-modal trigger button sits. Draggable at runtime; this is the initial spot.
export type TriggerPosition = 'top-left' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-right'

export interface ModalConfig {
  /** Initial trigger position. The user can drag it; it snaps to a preset and persists. Default 'bottom-right'. */
  position?: TriggerPosition
}

export interface QuickTerminalConfig {
  /** Hotkey(s) toggling the quick terminal. One binding or many (e.g. ['Mod+`', 'Control+k']). Default 'Mod+`'. */
  hotkey?: string | string[]
}

export interface WidgetConfig {
  /** Bottom-right corner modal. On by default; `false` disables it, an object configures it. */
  modal?: boolean | ModalConfig
  /** Top drop-down quick terminal. On by default; `false` disables it, an object sets the hotkey(s). */
  quickTerminal?: boolean | QuickTerminalConfig
}

export interface AidxConfig {
  enabled?: boolean
  widgetUrl?: string
  /** Widget layouts + their options. Both layouts are enabled by default. */
  widget?: WidgetConfig
  previewId?: string
  stateRoot?: string
  harness?: string
  harnessBin?: string
  sessionId?: string
  testRunner?: string
  /** Fixed engine port. Used by the Next.js integration so server boot + client widget agree. */
  port?: number
  /**
   * Our minimal chat grounding prompt. `true`/omitted injects it (default); `false` opts out
   * entirely (you take full control of the agent); a string replaces it with your own.
   */
  systemPrompt?: string | boolean
  /** @deprecated use harnessBin */ claudePath?: string
  /** @deprecated use sessionId */ claudeSessionId?: string
}

export function defineConfig<T extends AidxConfig>(config: T): T {
  return config
}
