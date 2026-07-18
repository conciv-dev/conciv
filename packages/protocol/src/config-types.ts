export type TriggerPosition = 'top-left' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-right'

export interface ModalConfig {
  position?: TriggerPosition
}

export interface QuickTerminalConfig {
  hotkey?: string | string[]
}

export interface WidgetConfig {
  modal?: boolean | ModalConfig

  quickTerminal?: boolean | QuickTerminalConfig
}

export interface ConcivSettingsInit extends WidgetConfig {
  defaultOpen?: boolean
}

export interface ExtensionConfigRegistry {}

export interface ConcivConfig {
  enabled?: boolean

  extensions?: {[Name in keyof ExtensionConfigRegistry]?: ExtensionConfigRegistry[Name]}
  widgetUrl?: string

  widget?: WidgetConfig
  stateRoot?: string
  harness?: string
  harnessBin?: string
  sessionId?: string

  port?: number

  systemPrompt?: string | boolean
  claudePath?: string
  claudeSessionId?: string
}

export function defineConfig<T extends ConcivConfig>(config: T): T {
  return config
}
