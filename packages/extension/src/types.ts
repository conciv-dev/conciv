import type {H3} from 'h3'
import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {ToolCardProps, ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import type {RequestMeta, SessionClient} from '@mandarax/api-client'
import type {GrabApi} from '@mandarax/grab'

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

export type ToolRenderer = Component<ToolCardProps>

export type ExtensionTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  promptSnippet?: string
  promptGuidelines?: string[]
  __execute?: (input: unknown, ctx?: unknown) => Promise<unknown>
  __render?: ToolRenderer
}

export type ClientFactoryResult<ClientReturnValue extends object> = {
  value: ClientReturnValue
  dispose?: () => void
}

export type ServerApi<Config> = {config: Config; cwd: string; app: H3}

export type ServerResult<Context> = {context: Context; dispose?: () => void | Promise<void>}

export type ClientApi = {apiBase: string; client: SessionClient; requestMeta: () => RequestMeta}

export type ConfigOf<Schema> = [Schema] extends [z.ZodNever] ? Record<never, never> : z.output<Schema>

export type UnionToIntersection<Union> = (Union extends unknown ? (incoming: Union) => void : never) extends (
  merged: infer Intersection,
) => void
  ? Intersection
  : never

export type CtxOf<Tool> = Tool extends {__ctx?: infer Ctx} ? Ctx : unknown

export type RequiredContext<Tools extends readonly unknown[]> = UnionToIntersection<CtxOf<Tools[number]>>

export type RegisterExtension<Extension extends {name: string; configSchema?: z.ZodType}> = Extension extends {
  name: infer Name extends string
  configSchema: infer Schema extends z.ZodType
}
  ? {[Key in Name]: z.input<Schema>}
  : Record<never, never>
