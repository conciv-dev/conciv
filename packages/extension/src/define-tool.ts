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

export type ToolDefinition<Name extends string, Schema extends z.ZodObject<z.ZodRawShape>, Output extends z.ZodType> = {
  name: Name
  description: string
  inputSchema: Schema
  outputSchema?: Output
  errors?: ToolErrors
  meta?: ToolMeta
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
  approval?: 'ask'
}

export type ToolBuilder<
  Name extends string = string,
  Schema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType = z.ZodType,
  Ctx = unknown,
> = Omit<ExtensionTool, 'name' | 'inputSchema'> & {
  name: Name
  inputSchema: Schema
  outputSchema?: Output
  errors?: ToolErrors
  meta?: ToolMeta
  binding?: ToolBinding
  __ctx?: Ctx
  __clientExecute?: (input: unknown) => Promise<unknown>
  server: <HandlerCtx>(
    execute: (input: z.infer<Schema>, ctx: HandlerCtx, request: ToolRequest) => Promise<unknown> | unknown,
  ) => ToolBuilder<Name, Schema, Output, HandlerCtx>
  client: (execute: (input: z.infer<Schema>) => Promise<unknown> | unknown) => ToolBuilder<Name, Schema, Output, Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Name, Schema, Output, Ctx>
}

type ToolNameOf<Tool> = Tool extends {name: infer Name extends string} ? (string extends Name ? never : Name) : never

type ToolInputSchemaOf<Tool> = Tool extends {inputSchema: infer Schema extends z.ZodType} ? Schema : z.ZodNever

type ToolOutputSchemaOf<Tool> = Tool extends {outputSchema?: infer Schema}
  ? NonNullable<Schema> extends z.ZodType
    ? NonNullable<Schema>
    : z.ZodUnknown
  : z.ZodUnknown

export type RegisteredTool<Schema extends z.ZodType, Output extends z.ZodType> = {
  inputSchema: Schema
  outputSchema: Output
}

export type RegisteredTools<Tools extends readonly unknown[]> = {
  [Tool in Tools[number] as ToolNameOf<Tool>]: RegisteredTool<ToolInputSchemaOf<Tool>, ToolOutputSchemaOf<Tool>>
}

type ToolState = {
  binding?: ToolBinding
  execute?: (input: unknown, ctx?: unknown, request?: ToolRequest) => Promise<unknown>
  serverRun?: (input: unknown, ctx?: unknown, request?: ToolRequest) => Promise<unknown>
  clientExecute?: (input: unknown) => Promise<unknown>
  render?: ToolRenderer
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

function toolBuilder<Name extends string, Schema extends z.ZodObject<z.ZodRawShape>, Output extends z.ZodType, Ctx>(
  definition: ToolDefinition<Name, Schema, Output>,
  state: ToolState,
): ToolBuilder<Name, Schema, Output, Ctx> {
  return {
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
    binding: state.binding,
    __execute: state.execute,
    __serverRun: state.serverRun,
    __clientExecute: state.clientExecute,
    __render: state.render,
    server<HandlerCtx>(
      execute: (input: z.infer<Schema>, ctx: HandlerCtx, request: ToolRequest) => Promise<unknown> | unknown,
    ) {
      assertUnbound(definition.name, state.binding)
      const invoke = async (parsed: z.infer<Schema>, ctx: unknown, request: ToolRequest | undefined) =>
        execute(parsed, ctx as HandlerCtx, request as ToolRequest)
      return toolBuilder<Name, Schema, Output, HandlerCtx>(definition, {
        ...state,
        binding: 'server',
        execute: async (raw, ctx, request) => invoke(definition.inputSchema.parse(raw), ctx, request),
        serverRun: async (input, ctx, request) => invoke(input as z.infer<Schema>, ctx, request),
      })
    },
    client(execute) {
      assertUnbound(definition.name, state.binding)
      return toolBuilder<Name, Schema, Output, Ctx>(definition, {
        ...state,
        binding: 'client',
        clientExecute: async (raw) => execute(definition.inputSchema.parse(raw)),
      })
    },
    render(renderer) {
      return toolBuilder<Name, Schema, Output, Ctx>(definition, {...state, render: renderer})
    },
  }
}

export function defineTool<
  const Name extends string,
  Schema extends z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType,
>(definition: ToolDefinition<Name, Schema, Output>): ToolBuilder<Name, Schema, Output, unknown> {
  assertToolMeta(definition.name, definition.meta)
  return toolBuilder<Name, Schema, Output, unknown>(definition, {})
}
