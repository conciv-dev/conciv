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

  launcher?: 'native' | 'mascot' | false
}

export interface ExtensionRegistry {}

export type RegisteredExtensionConfig<Entry> = Entry extends {config: infer Config} ? Config : never

export interface ConcivConfig {
  enabled?: boolean

  extensions?: {[Name in keyof ExtensionRegistry]?: RegisteredExtensionConfig<ExtensionRegistry[Name]>}
  widgetUrl?: string

  widget?: WidgetConfig | false
  stateRoot?: string
  harness?: string
  harnessBin?: string
  sessionId?: string

  port?: number

  devEndpointDir?: string

  systemPrompt?: string | boolean
  claudePath?: string
  claudeSessionId?: string
}

export function defineConfig<T extends ConcivConfig>(config: T): T {
  return config
}
