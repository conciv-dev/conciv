import {z} from 'zod'
import type {Component} from 'solid-js'
import type {ThemeTokens} from '@mandarax/ui-kit-system'

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

// What an extension's .client(mx => …) half can do in the widget (browser).
export type ClientApi = {
  ui: {setTheme: (tokens: ThemeTokens) => void}
  registerComposerAction: (action: ExtComposerAction) => void
}

// What an extension's .server(mx => …) half can do in core (node): add agent tools, extend the prompt.
export type ServerApi = {
  registerTool: (tool: ExtensionServerTool) => void
  systemPrompt: {append: (text: string) => void}
}

export type MandaraxExtension = {
  id: string
  clientFn?: (mx: ClientApi) => void
  serverFn?: (mx: ServerApi) => void
}

export type ExtensionBuilder = MandaraxExtension & {
  client: (fn: (mx: ClientApi) => void) => ExtensionBuilder
  server: (fn: (mx: ServerApi) => void) => ExtensionBuilder
}

// The author entry point: defineExtension({id}).client(…).server(…). Each half is optional and the
// chain composes (returns the same builder), matching @tanstack/ai's .server()/.client() split.
export function defineExtension(meta: {id: string}): ExtensionBuilder {
  const builder: ExtensionBuilder = {
    id: meta.id,
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

// Define a typed agent tool: execute receives args already validated against inputSchema, and the
// returned tool conforms to the wire shape core's MCP server registers (execute re-parses at the
// boundary, so a malformed model call is rejected there too).
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(tool: {
  name: string
  description: string
  inputSchema: S
  execute: (input: z.infer<S>) => Promise<unknown> | unknown
}): ExtensionServerTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: async (raw: unknown) => tool.execute(tool.inputSchema.parse(raw)),
  }
}
