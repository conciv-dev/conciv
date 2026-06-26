import type {H3} from 'h3'
import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {ToolCardProps, ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import type {RequestMeta, SessionClient} from '@mandarax/api-client'
import type {GrabApi} from '@mandarax/grab'
import type {LocateResult} from '@mandarax/protocol/page-introspect-types'
import type {OpenSourceResult} from '@mandarax/protocol/page-types'

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
  streamTitle?: string
  __execute?: (input: unknown, ctx?: unknown) => Promise<unknown>
  __render?: ToolRenderer
}

export type ClientFactoryResult<ClientReturnValue extends object> = {
  value: ClientReturnValue
  dispose?: () => void
}

export type ServerApi<Config> = {config: Config; cwd: string; app: H3}

export type ServerResult<Context> = {context: Context; dispose?: () => void | Promise<void>}

// Page introspection handed to a client extension: where the cursor is, what a host element is, and
// the element's source location (the widget supplies the concrete react-bridge implementation).
export type PageInspect = {
  elementAt: (x: number, y: number) => Element | null
  describe: (host: Element) => {component: string; file: string | null}
  locate: (el: Element) => Promise<LocateResult | null>
}

// What an extension's .client() factory receives. Runs once at widget mount (server-independent), so a
// built-in like highlight works even when the chat probe fails. Beyond the chat client it carries the
// page capabilities a page-control extension needs: introspection, open-in-editor, a toast, a shared
// overlay surface, and the document/window environment.
export type ClientApi = {
  apiBase: string
  client: SessionClient
  requestMeta: () => RequestMeta
  page: PageInspect
  openSource: (loc: LocateResult) => Promise<OpenSourceResult>
  toast: (message: string, tone?: 'info' | 'success' | 'error') => void
  surface: () => HTMLElement
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
