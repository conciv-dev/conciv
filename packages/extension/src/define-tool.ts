import type {z} from 'zod'
import type {ExtensionTool, ToolRenderer, ToolRequest} from './types.js'

export type ToolMeta = {
  summary: string
  category?: string
  mutating?: boolean
  mirrors?: boolean
  keywords?: readonly string[]
}

export type ToolErrorSpec = {message: string; data?: z.ZodType}
export type ToolErrors = Record<string, ToolErrorSpec>

export type ToolBinding = 'server' | 'client'

export type ToolError = Error & {readonly isToolError: true; code: string; data?: unknown}

export function toolError(code: string, options: {message?: string; data?: unknown} = {}): ToolError {
  return Object.assign(new Error(options.message ?? code), {isToolError: true as const, code, data: options.data})
}

export function isToolError(value: unknown): value is ToolError {
  return value instanceof Error && 'isToolError' in value && value.isToolError === true
}

export type ToolBuilder<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown> = ExtensionTool & {
  inputSchema: Schema
  outputSchema?: z.ZodType
  errors?: ToolErrors
  meta?: ToolMeta
  binding?: ToolBinding
  __ctx?: Ctx
  __clientExecute?: (input: unknown) => Promise<unknown>
  server: (
    execute: (input: z.infer<Schema>, ctx: Ctx, request: ToolRequest) => Promise<unknown> | unknown,
  ) => ToolBuilder<Schema, Ctx>
  client: (execute: (input: z.infer<Schema>) => Promise<unknown> | unknown) => ToolBuilder<Schema, Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Schema, Ctx>
}

function assertToolMeta(name: string, meta: ToolMeta | undefined): void {
  if (meta === undefined) return
  if (typeof meta.summary !== 'string' || meta.summary.trim() === '') {
    throw new Error(`tool "${name}": meta.summary must describe what the tool does`)
  }
  if (meta.summary.trim().toLowerCase() === name.trim().toLowerCase()) {
    throw new Error(`tool "${name}": meta.summary must not repeat the tool name`)
  }
}

function assertUnbound(name: string, binding: ToolBinding | undefined): void {
  if (binding !== undefined) throw new Error(`tool "${name}" already has a ${binding} binding`)
}

export function defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(definition: {
  name: string
  description: string
  inputSchema: Schema
  outputSchema?: z.ZodType
  errors?: ToolErrors
  meta?: ToolMeta
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
  approval?: 'ask'
}): ToolBuilder<Schema, Ctx> {
  assertToolMeta(definition.name, definition.meta)
  const builder: ToolBuilder<Schema, Ctx> = {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    errors: definition.errors,
    meta: definition.meta,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    streamTitle: definition.streamTitle,
    approval: definition.approval,
    server(execute) {
      assertUnbound(definition.name, builder.binding)
      builder.binding = 'server'
      const invoke = async (parsed: z.infer<Schema>, ctx: unknown, request: ToolRequest | undefined) =>
        execute(parsed, ctx as Ctx, request as ToolRequest)
      builder.__execute = async (raw, ctx, request) => invoke(definition.inputSchema.parse(raw), ctx, request)
      builder.__serverRun = async (input, ctx, request) => invoke(input as z.infer<Schema>, ctx, request)
      return builder
    },
    client(execute) {
      assertUnbound(definition.name, builder.binding)
      builder.binding = 'client'
      builder.__clientExecute = async (raw) => execute(definition.inputSchema.parse(raw))
      return builder
    },
    render(renderer) {
      builder.__render = renderer
      return builder
    },
  }
  return builder
}
