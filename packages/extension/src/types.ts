import type {Component, JSX} from 'solid-js'
import type {z} from 'zod'
import type {ContentPart} from '@tanstack/ai'
import type {AnyRouter} from '@orpc/server'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'
import type {UIMessage} from '@conciv/protocol/chat-types'

export type ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget' | 'surface' | 'connect'

export type ConnectGate = {preflight: () => Promise<string | null>}

export type ExtensionView = {
  id: string
  label: string
  icon?: Component<{class?: string}>
  Component: Component
  actions?: Component
}

export type ToolRequest = {sessionId: string; model: string | null}

export type ExtensionServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  approval?: 'ask'
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
}

export type ExtensionCommand = {
  name: string
  description: string
  argumentHint?: string
  prompt(args: string): string
}

export type ToolRenderer = Component<ToolCardProps>

export type ExtensionTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
  approval?: 'ask'
  __execute?: (input: unknown, ctx?: unknown, request?: ToolRequest) => Promise<unknown>
  __render?: ToolRenderer
}

export type ClientFactoryResult<ClientReturnValue extends object> = {
  value: ClientReturnValue
  dispose?: () => void
}

export type ServerSessions = {
  resumeToken(sessionId: string): Promise<string | null>
  recordToken(sessionId: string, token: string): Promise<void>
  chatBusy(sessionId: string): boolean
  model(sessionId: string): Promise<string | null>
  onChatTurn(listener: (sessionId: string) => void): void
}

export type ServerHarness = {
  id: string
  ttyCommand?: (opts: TtyCommandOpts) => TtyCommand
  release?: (sessionId: string) => void
  transcriptExists?: (token: string) => boolean
  transcriptMessages?: (token: string) => Promise<UIMessage[]>
}

export type ServerApi<Config> = {
  config: Config
  cwd: string
  stateDir: string
  sessions: ServerSessions
  harness: ServerHarness
}

export type ServerResult<Context> = {
  context: Context
  router?: AnyRouter
  app?: unknown
  turnEnd?: (sessionId: string) => void | Promise<void>
  dispose?: () => void | Promise<void>
}

export type ConfigOf<Schema> = [Schema] extends [z.ZodNever] ? Record<never, never> : z.output<Schema>

export type UnionToIntersection<Union> = (Union extends unknown ? (incoming: Union) => void : never) extends (
  merged: infer Intersection,
) => void
  ? Intersection
  : never

export type AttachmentDocumentPart = {type: 'document'; source: {type: 'data'; mimeType: string; value: string}}

export type AttachmentExpand<Ctx = unknown> = (
  part: AttachmentDocumentPart,
  ctx: Ctx,
) => Promise<readonly ContentPart[]> | readonly ContentPart[]

export type AttachmentCardProps = {remove?: JSX.Element}

export type ExtensionAttachment = {mime: string; __card?: Component<AttachmentCardProps>; __ctx?: unknown}

export type AttachmentCardEntry = {mime: string; render: Component<AttachmentCardProps>}

export type CtxOf<Tool> = Tool extends {__ctx?: infer Ctx} ? Ctx : unknown

export type RequiredContext<Tools extends readonly unknown[]> = UnionToIntersection<CtxOf<Tools[number]>>
