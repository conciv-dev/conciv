import {z} from 'zod'
import type {Component, JSX} from 'solid-js'
import type {ThemeTokens} from '@mandarax/ui-kit-system'
import type {ToolCardProps, ToolRenderContext, ToolRenderResultOptions} from '@mandarax/protocol/tool-view-types'
import type {LocateResult, InspectResult, TreeResult} from '@mandarax/protocol/page-introspect-types'

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
  execute: (input: unknown) => Promise<unknown>
}

export type ExtensionServerContributions = {
  tools: ExtensionServerTool[]
  systemPrompt: string[]
}

// The slim context a composer-action click receives; the widget adapts its internal bag down to this.
export type ComposerActionCtx = {
  insert: (text: string) => void
  notify: (message: string) => void
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
}

// What an extension's .server(mx => …) half can do in core: add agent tools, extend the prompt.
export type ServerApi = {
  registerTool: (tool: ToolDefinition) => void
  systemPrompt: {append: (text: string) => void}
}

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
  execute?(input: z.infer<TParams>): Promise<TResult> | TResult
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
