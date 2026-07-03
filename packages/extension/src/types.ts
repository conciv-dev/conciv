import type {H3} from 'h3'
import type {Component, ComponentProps} from 'solid-js'
import type {DialogApi, PopoverApi} from '@conciv/ui-kit-system'
import type {z} from 'zod'
import type {ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {RequestMeta, SessionClient} from '@conciv/api-client'
import type {GrabApi} from '@conciv/grab'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'
import type {OpenSourceResult} from '@conciv/protocol/page-types'
import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'

export type ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget'

export type ExtensionView = {id: string; label: string; icon?: Component<{class?: string}>; Component: Component}

export type ExtensionViewHost = {setLocked(locked: boolean): void}

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
    view: ExtensionViewHost
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
  recordToken(sessionId: string, token: string): Promise<void>
  chatBusy(sessionId: string): boolean
  model(sessionId: string): Promise<string | null>
}

export type ServerHarness = {
  id: string
  ttyCommand?: (opts: TtyCommandOpts) => TtyCommand
  release?: (sessionId: string) => void
  transcriptExists?: (token: string) => boolean
}

export type ServerApi<Config> = {
  config: Config
  cwd: string
  app: H3
  sessions: ServerSessions
  harness: ServerHarness
}

export type ServerResult<Context> = {context: Context; dispose?: () => void | Promise<void>}

export type PageInspect = {
  elementAt: (x: number, y: number) => Element | null
  describe: (host: Element) => {component: string; file: string | null}
  locate: (el: Element) => Promise<LocateResult | null>
}

export type ClientApi = {
  apiBase: string
  activeSession: () => string | null
  requestMeta: () => RequestMeta
  page: PageInspect
  openSource: (loc: LocateResult) => Promise<OpenSourceResult>
  toast: (message: string, tone?: 'info' | 'success' | 'error') => void
  surface: () => HTMLElement

  suppressWhile: (active: () => boolean) => () => void
  Dialog: () => DialogApi

  Popover: () => {
    Root: Component<ComponentProps<PopoverApi['Root']>>
    Positioner: Component<ComponentProps<PopoverApi['Positioner']>>
    Content: Component<ComponentProps<PopoverApi['Content']>>
  }
  env: {reducedMotion: () => boolean; doc: Document; win: Window}
}

export type ConfigOf<Schema> = [Schema] extends [z.ZodNever] ? Record<never, never> : z.output<Schema>

export type UnionToIntersection<Union> = (Union extends unknown ? (incoming: Union) => void : never) extends (
  merged: infer Intersection,
) => void
  ? Intersection
  : never

export type CtxOf<Tool> = Tool extends {__ctx?: infer Ctx} ? Ctx : unknown

export type RequiredContext<Tools extends readonly unknown[]> = UnionToIntersection<CtxOf<Tools[number]>>
