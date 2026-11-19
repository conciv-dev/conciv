import type {Component, JSX} from 'solid-js'
import type {z} from 'zod'
import type {ContentPart} from '@conciv/protocol/chat-message-types'
import type {AnyRouter, ErrorMap, Meta, Middleware, ORPCErrorConstructorMap} from '@orpc/server'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import type {ServerHarness, ServerSessions} from '@conciv/protocol/harness-types'
import type {ToolRequest} from '@conciv/protocol/tool-call-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {RawFrame, Settings, SourceLoc} from '@conciv/contract'
import type {UpgradeWebSocket} from '@conciv/serve/rpc'

export type {ServerHarness, ServerSessions} from '@conciv/protocol/harness-types'
export type {ToolRequest} from '@conciv/protocol/tool-call-types'

export type ExtensionSlot = 'composer' | 'empty' | 'status' | 'widget' | 'surface' | 'connect'

export type ConnectGate = {preflight: () => Promise<string | null>}

export type ExtensionView = {
  id: string
  label: string
  icon?: Component<{class?: string}>
  Component: Component
  actions?: Component
}

export type ExtensionServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  approval?: 'ask'
  mutating: boolean
  errors: {code: string; message: string}[]
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
}

export type ExtensionCommandContext = {sessionId: string}

export type ExtensionCommand = {
  name: string
  description: string
  run: (context: ExtensionCommandContext) => void
}

export type ToolRenderer = Component<ToolCardProps>

export type ToolCard = ToolCardView

export type ServerToolPageAccess = {call: (name: string, input: Record<string, unknown>) => Promise<unknown>}

export type ServerToolRegistryAccess = {call: (name: string, input: unknown) => Promise<unknown>}

export type ExtensionTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
  display?: 'standalone'
  approval?: 'ask'
  __serverRun?: (
    input: unknown,
    ctx: unknown,
    request: ToolRequest,
    page: ServerToolPageAccess,
    tools: ServerToolRegistryAccess,
  ) => Promise<unknown>
  __render?: ToolCard
}

export type ClientEffect = {
  name: string
  description: string
  set: (enabled: boolean) => void
  enabled: () => boolean
}

export type ClientFactoryResult<ClientReturnValue extends object> = {
  value: ClientReturnValue
  effects?: readonly ClientEffect[]
  dispose?: () => void
}

export interface SettingsRegistry {}

export type SettingsForNamespace<Namespace extends string> = Namespace extends keyof SettingsRegistry
  ? SettingsRegistry[Namespace] extends object
    ? SettingsRegistry[Namespace]
    : Record<string, unknown>
  : Record<string, unknown>

export type ExtensionScope<Namespace extends string = string> = {
  readonly namespace: Namespace
  settings: Settings<SettingsForNamespace<Namespace>>
}

export type ExtensionSettingsSchema = z.ZodObject<Record<string, z.ZodDefault>>

export type NoSettings = z.ZodObject<Record<never, never>>

export type InferSettings<Schema extends ExtensionSettingsSchema> = z.output<Schema>

export type SettingsReader<Value extends object> = {
  all: () => Promise<Value>
  onChange: (fn: (value: Value) => void) => Promise<() => void>
}

export type ServerApi<Config, SettingsValue extends object = Record<never, never>> = {
  config: Config
  settings: SettingsReader<SettingsValue>
  scope: <Namespace extends string>(namespace: Namespace) => ExtensionScope<Namespace>
  cwd: string
  basePath: string
  stateDir: string
  sessions: ServerSessions
  harness: (sessionId: SessionId) => Promise<ServerHarness>
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
  bundler?: Bundler.BundlerBridge
  nativeUrl: () => string | undefined
  upgradeWebSocket: UpgradeWebSocket
}

export type ToolCallContext = {request: ToolRequest}

export type ToolMiddleware = Middleware<
  ToolCallContext,
  Record<never, never>,
  unknown,
  unknown,
  ORPCErrorConstructorMap<ErrorMap>,
  Meta
>

export type ServerResult<Context> = {
  context: Context
  middleware?: ToolMiddleware
  router?: AnyRouter
  app?: unknown
  turnEnd?: (sessionId: SessionId) => void | Promise<void>
  dispose?: () => void | Promise<void>
}

export type InferConfig<Schema> = [Schema] extends [z.ZodNever] ? Record<never, never> : z.output<Schema>

export type ExtensionPromptContext = {cwd: string}

export type SystemPromptFactory<Config> = (config: Config, context: ExtensionPromptContext) => string

export type SystemPromptResolver = (config: unknown, context: ExtensionPromptContext) => string | undefined

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

export type InferToolContext<Tool> = Tool extends {__ctx?: infer Ctx} ? Ctx : unknown

export type RequiredContext<Tools extends readonly unknown[]> = UnionToIntersection<InferToolContext<Tools[number]>>
