import {z} from 'zod'
import type {Component, JSX} from 'solid-js'
import type {ThemeTokens} from '@mandarax/ui-kit-system'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'

// A live UI region an extension paints into a named widget slot / header / footer (Pi-style setters).
export type UiFactory = () => JSX.Element

// A client-side renderer for a tool's call/result cards (the browser half of a tool definition).
export type ToolRenderer = Component<ToolCardProps>

// The empty chat state (greeting + starters). An extension swaps it with ui.setEmptyState(factory).
export type EmptyStateProps = {onStarter: (text: string) => void}
export type EmptyStateFactory = Component<EmptyStateProps>

// The server-side shape an extension contributes: a mandarax MCP tool (name + description + zod
// inputSchema the SDK registers via .shape + an execute validated at the boundary). Structurally
// identical to @mandarax/tools' MandaraxServerTool, so core registers extension tools alongside the
// built-ins with no cast.
export type ExtensionServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}

// What an extension's .server(mx => …) half collects: extra agent tools + system prompt text.
export type ExtensionServerContributions = {
  tools: ExtensionServerTool[]
  systemPrompt: string[]
}

// The slim, stable context a composer-action click receives (the widget adapts its richer internal
// capability bag down to this — extensions never see widget internals like the session client).
export type ComposerActionCtx = {
  insert: (text: string) => void
  notify: (message: string) => void
}

// A button an extension adds to the composer.
export type ExtComposerAction = {
  id: string
  label: string
  icon: Component<{class?: string}>
  onClick: (ctx: ComposerActionCtx) => void | Promise<void>
}

// The erased tool shape collected from an extension (per-tool generics dropped for the array).
export type ExtensionTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  promptSnippet?: string
  promptGuidelines?: string[]
  serverExecute?: (input: unknown) => Promise<unknown>
  clientRender?: ToolRenderer
}

// The builder: .server(execute) attaches the node half, .render(Component) the browser half. Both
// live on one object so the renderer is co-located with the definition (Pi-style), and each runtime
// loader reads its own half.
export type ToolBuilder<S extends z.ZodObject<z.ZodRawShape>> = ExtensionTool & {
  inputSchema: S
  server: (execute: (input: z.infer<S>) => Promise<unknown> | unknown) => ToolBuilder<S>
  render: (renderer: ToolRenderer) => ToolBuilder<S>
}

// What an extension's .client(mx => …) half can do in the widget (browser).
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
  registerToolRenderer: (name: string, renderer: ToolRenderer) => void
}

// What an extension's .server(mx => …) half can do in core (node): add agent tools, extend the prompt.
export type ServerApi = {
  registerTool: (tool: ExtensionTool) => void
  systemPrompt: {append: (text: string) => void}
}

export type MandaraxExtension = {
  id: string
  tools?: ExtensionTool[]
  clientFn?: (mx: ClientApi) => void
  serverFn?: (mx: ServerApi) => void
}

export type ExtensionBuilder = MandaraxExtension & {
  client: (fn: (mx: ClientApi) => void) => ExtensionBuilder
  server: (fn: (mx: ServerApi) => void) => ExtensionBuilder
}

// The author entry point: defineExtension({id, tools}).client(…).server(…). Each half is optional and
// the chain composes (returns the same builder), matching @tanstack/ai's .server()/.client() split.
export function defineExtension(meta: {id: string; tools?: ExtensionTool[]}): ExtensionBuilder {
  const builder: ExtensionBuilder = {
    id: meta.id,
    tools: meta.tools,
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

// Define a tool: name + schema declared once; .server(execute) re-parses args at the node boundary,
// .render(Component) supplies the browser card. promptSnippet/promptGuidelines self-document the tool
// into the system prompt when it is registered (Pi parity).
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string
  description: string
  inputSchema: S
  promptSnippet?: string
  promptGuidelines?: string[]
}): ToolBuilder<S> {
  const builder: ToolBuilder<S> = {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    promptSnippet: def.promptSnippet,
    promptGuidelines: def.promptGuidelines,
    server(execute) {
      builder.serverExecute = async (raw: unknown) => execute(def.inputSchema.parse(raw))
      return builder
    },
    render(renderer) {
      builder.clientRender = renderer
      return builder
    },
  }
  return builder
}
