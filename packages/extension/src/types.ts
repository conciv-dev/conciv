import type {Component, JSX} from 'solid-js'
import type {z} from 'zod'
import type {ContentPart} from '@tanstack/ai'
import type {AnyRouter} from '@orpc/server'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import type {HarnessConnectContext, TranscriptHandle} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import type {SendVerdict, TokenClaim} from '@conciv/protocol/chat-types'

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
  recordToken(sessionId: string, token: string): Promise<TokenClaim>
  sessionForHarnessId(harnessSessionId: string): Promise<string | null>
  chatBusy(sessionId: string): boolean
  model(sessionId: string): Promise<string | null>
  onLocalRun(listener: (sessionId: string, phase: 'start' | 'end') => void): () => void
  onSessionDetached(listener: (sessionId: string) => void): () => void
  onLaunch(listener: (sessionId: string) => void): () => void
  beforeSend(check: (sessionId: string, opts: {force: boolean}) => SendVerdict): () => void
  onMcpRequest(listener: (sessionId: string) => void): () => void
  notifyChange(): void
}

export type ServerHarness = {
  id: string
  ttyCommand?: (ctx: HarnessConnectContext) => TtyCommand
  release?: (sessionId: string) => void
  transcriptExists?: (token: string) => Promise<boolean>
  observeTranscript?: (token: string) => Promise<TranscriptHandle | null>
}

export type ServerApi<Config> = {
  config: Config
  cwd: string
  basePath: string
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
