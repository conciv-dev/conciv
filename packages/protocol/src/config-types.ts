import type {HubAccess} from './chat-types.js'

export type TriggerPosition = 'top-left' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-right'

export interface ModalConfig {
  position?: TriggerPosition
}

export interface QuickTerminalConfig {
  hotkey?: string | string[]
}

export type ConcivSurface = 'page' | 'dock'

export interface WidgetConfig {
  modal?: boolean | ModalConfig

  quickTerminal?: boolean | QuickTerminalConfig
}

export interface ConcivSettingsInit extends WidgetConfig {
  defaultOpen?: boolean

  launcher?: 'native' | 'mascot' | false

  surface?: ConcivSurface
}

export interface ExtensionRegistry {}

export interface ExtensionPackage {
  server: string
  client: string
  config: unknown
}

export interface ConcivConfig {
  enabled?: boolean

  extensions?: readonly ExtensionPackage[]
  widgetUrl?: string

  widget?: WidgetConfig | false
  stateRoot?: string
  harness?: string
  harnessBin?: string
  sessionId?: string

  port?: number

  devEndpointDir?: string

  homeDir?: string

  hubAccess?: HubAccess

  systemPrompt?: string | boolean
  claudePath?: string
  claudeSessionId?: string
}

export function defineConfig<T extends ConcivConfig>(config: T): T {
  return config
}
