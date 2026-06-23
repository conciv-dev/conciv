import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {ToolCardProps, ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import type {RequestMeta, SessionClient} from '@mandarax/api-client'
import type {GrabApi} from '@mandarax/grab'
import type {ThemeTokens} from '@mandarax/ui-kit-system'

export type ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget'

export type ComposerActions = {
  insert: (text: string) => void
  notify: (message: string) => void
  setBusy: (busy: boolean) => void
  newSession: () => void
  addDivider: (kind: 'new' | 'compact') => void
  compact: () => void
  resetUsage: () => void
}

export type ExtensionHostContext = ToolViewCtx &
  ComposerActions & {
    client: SessionClient
    requestMeta: () => RequestMeta
    grab: GrabApi
    currentSlot: ExtensionSlot
  }

export type ExtensionServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}

// What a .server() factory returns — both halves optional (an extension may contribute just a prompt).
export type ServerContribution = {
  tools?: ExtensionServerTool[]
  systemPrompt?: string
}

// The merged result collectServerContributions feeds the engine — both halves always populated.
// systemPrompt is the list of appends (the engine joins them), matching the engine's contract.
export type ExtensionServerContributions = {
  tools: ExtensionServerTool[]
  systemPrompt: string[]
}

export type ToolRenderer = Component<ToolCardProps>

export type ExtensionTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  promptSnippet?: string
  promptGuidelines?: string[]
  __execute?: (input: unknown) => Promise<unknown>
  __render?: ToolRenderer
}

export type ExtensionDefinition<ClientReturnValue extends object> = {
  name: string
  Component?: Component
  systemPrompt?: string
  theme?: ThemeTokens
  tools?: ExtensionTool[]
  __client?: () => ClientFactoryResult<ClientReturnValue>
  __server?: () => ServerContribution
}

export type ClientFactoryResult<ClientReturnValue extends object> = {
  value: ClientReturnValue
  dispose?: () => void
}
