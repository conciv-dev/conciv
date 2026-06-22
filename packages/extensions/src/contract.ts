import {z} from 'zod'
import type {Component, JSX} from 'solid-js'
import type {ThemeTokens} from '@mandarax/ui-kit-system'
import type {ToolCardProps, ToolRenderContext, ToolRenderResultOptions} from '@mandarax/protocol/tool-view-types'
import type {LocateResult, InspectResult, TreeResult} from '@mandarax/protocol/page-introspect-types'
import type {Collection} from '@tanstack/solid-db'
import type {TrailBaseCollectionConfig} from '@tanstack/trailbase-db-collection'
import type {LiveDb} from '@mandarax/protocol/db-types'
import type {SyncEngine, ClientSync} from '@mandarax/protocol/sync-types'

type ShapeOf<T> = Record<keyof T, unknown>

export type ClientCollectionSpec<TItem extends ShapeOf<TRecord>, TRecord extends ShapeOf<TItem>> = Omit<
  TrailBaseCollectionConfig<TItem, TRecord>,
  'recordApi' | 'id' | 'getKey'
>
export type ClientDb = {
  collection: <TItem extends {cid: string} & ShapeOf<TRecord>, TRecord extends ShapeOf<TItem> = TItem>(
    name: string,
    spec: ClientCollectionSpec<TItem, TRecord>,
  ) => Collection<TItem>
}

export type ExtensionEvent = 'session_start' | 'tool_execution_start'
export type EventCtx = {sessionId: string; previewId: string; tool?: string}
export type ToolExecuteCtx = {sessionId: string; previewId: string}
export type ApprovalPolicy = 'auto' | 'ask'

export type {ToolRenderContext, ToolRenderResultOptions} from '@mandarax/protocol/tool-view-types'

export type UiFactory = () => JSX.Element
export type ToolRenderer = Component<ToolCardProps>
export type EmptyStateProps = {onStarter: (text: string) => void}
export type EmptyStateFactory = Component<EmptyStateProps>

// The wire tool core's MCP server registers; structurally identical to @mandarax/tools' MandaraxServerTool.
export type ExtensionServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown, ctx?: ToolExecuteCtx) => Promise<unknown>
}

export type ExtensionServerContributions = {
  tools: ExtensionServerTool[]
  systemPrompt: string[]
  eventHandlers: Record<ExtensionEvent, ((ctx: EventCtx) => void | Promise<void>)[]>
  approvalPolicies: Record<string, ApprovalPolicy>
}

// One interactive element pick: the human-entered text plus where the element lives in source and on
// screen. source/rect are null when unavailable (no build-injected source attr, or a non-element pick),
// so a source anchor degrades to file:line rather than silently pinning an ambiguous node.
export type PickResult = {
  text: string
  source: {file: string; line: number | null; column: number | null; component: string | null} | null
  rect: {x: number; y: number; width: number; height: number} | null
}

// Enter interactive element selection; onPick fires once with the grabbed element (never on cancel).
export type PickFn = (onPick: (result: PickResult) => void) => void

// The slim context a composer-action click receives; the widget adapts its internal bag down to this.
export type ComposerActionCtx = {
  insert: (text: string) => void
  notify: (message: string) => void
  runTool: (name: string, input: unknown) => Promise<unknown>
  pick: PickFn
}

export type ExtComposerAction = {
  id: string
  label: string
  icon: Component<{class?: string}>
  onClick: (ctx: ComposerActionCtx) => void | Promise<void>
}

// What an extension's .client(mx => …) half can do in the widget.
export type ClientApi = {
  ui: {
    setTheme: (tokens: ThemeTokens) => void
    setWidget: (key: string, factory: UiFactory | null) => void
    setHeader: (factory: UiFactory | null) => void
    setFooter: (factory: UiFactory | null) => void
    setStatus: (key: string, text: string | null) => void
    setEmptyState: (factory: EmptyStateFactory | null) => void
  }
  registerComposerAction: (action: ExtComposerAction) => void
  db: ClientDb
  sync: ClientSync
  runTool: (name: string, input: unknown) => Promise<unknown>
  pick: PickFn
  previewId: string
  sessionId: () => string | null
}

// What an extension's .server(mx => …) half can do in core: add agent tools, extend the prompt,
// declare live collections + CRDT rooms, react to lifecycle events, gate tools behind approval.
export type ServerApi = {
  registerTool: (tool: ToolDefinition) => void
  systemPrompt: {append: (text: string) => void}
  db: LiveDb
  sync: SyncEngine
  on: (event: ExtensionEvent, handler: (ctx: EventCtx) => void | Promise<void>) => void
  approval: (toolName: string, policy: ApprovalPolicy) => void
  // The project root the engine was started in — anchoring/doctor resolve source files under it.
  cwd: string
}

export type ServerServices = {db: LiveDb; sync: SyncEngine; cwd?: string}

// One loadable unit, carrying the tools and effects it contributes plus optional imperative halves.
export type MandaraxExtension = {
  id: string
  tools?: ToolDefinition[]
  effects?: EffectDefinition[]
  clientFn?: (mx: ClientApi) => void
  serverFn?: (mx: ServerApi) => void
}

export type ExtensionBuilder = MandaraxExtension & {
  client: (fn: (mx: ClientApi) => void) => ExtensionBuilder
  server: (fn: (mx: ServerApi) => void) => ExtensionBuilder
}

export function defineExtension(meta: {
  id: string
  tools?: ToolDefinition[]
  effects?: EffectDefinition[]
}): ExtensionBuilder {
  const builder: ExtensionBuilder = {
    id: meta.id,
    tools: meta.tools,
    effects: meta.effects,
    client(fn) {
      builder.clientFn = fn
      return builder
    },
    server(fn) {
      builder.serverFn = fn
      return builder
    },
  }
  return builder
}

// Pi's ToolDefinition: zod params, Solid JSX renderers, optional execute, names? for foreign harness
// tools one card serves. Method syntax keeps concrete defs assignable to the bare type in arrays.
export type ToolDefinition<
  TParams extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
  TResult = unknown,
> = {
  name: string
  names?: string[]
  label: string
  description: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters: TParams
  renderShell?: 'default' | 'self'
  prepareArguments?(args: unknown): z.infer<TParams>
  execute?(input: z.infer<TParams>, ctx?: ToolExecuteCtx): Promise<TResult> | TResult
  renderCall?(args: z.infer<TParams>, ctx: ToolRenderContext<z.infer<TParams>>): JSX.Element
  renderResult?(
    result: TResult,
    options: ToolRenderResultOptions,
    ctx: ToolRenderContext<z.infer<TParams>>,
  ): JSX.Element
}

// Identity helper preserving param inference, matching Pi's defineTool().
export function defineTool<TParams extends z.ZodObject<z.ZodRawShape>, TResult = unknown>(
  tool: ToolDefinition<TParams, TResult>,
): ToolDefinition<TParams, TResult> {
  return tool
}

// The stable author API an effect's render() receives; the widget supplies the concrete implementation.
export type EffectCtx = {
  page: {
    elementAt: (x: number, y: number) => Element | null
    componentHostAt: (el: Element) => Element | null
    describe: (host: Element) => {component: string; file: string | null}
    locate: (el: Element) => Promise<LocateResult | null>
    inspect: (el: Element) => Promise<InspectResult | null>
    tree: () => Promise<TreeResult>
    find: (name: string) => {matches: {ref: string; component: string}[]; total: number}
    addRef: (el: Element) => string
  }
  openSource: (locate: LocateResult) => Promise<'opened' | 'no-source' | 'failed'>
  toast: (msg: string, tone?: 'info' | 'success' | 'error') => void
  env: {reducedMotion: () => boolean; doc: Document; win: Window}
  runTool: (name: string, input: unknown) => Promise<unknown>
  db: ClientDb
  sync: ClientSync
  previewId: string
  sessionId: () => string | null
  disable: () => void
}

export type EffectSetupCtx = {enable: () => void; disable: () => void; isEnabled: () => boolean}

// A toggleable Solid page overlay; render() paints it, setup() is an optional lifecycle (e.g. a hotkey).
export type EffectDefinition = {
  name: string
  label: string
  description: string
  render: (ctx: EffectCtx) => JSX.Element
  setup?: (ctx: EffectSetupCtx) => (() => void) | void
}

// Identity helper, the parallel to defineTool.
export function defineEffect(effect: EffectDefinition): EffectDefinition {
  return effect
}
