import type {z} from 'zod'
import type {ToolIconKey, ToolLabel} from '@conciv/protocol/tool-icon-types'
import type {ToolCaptureMode} from '@conciv/protocol/element-capture-types'
import type {
  ClientEffect,
  ExtensionTool,
  ServerToolRegistryAccess,
  ServerToolPageAccess,
  ToolRenderer,
  ToolRequest,
} from './types.js'

export type ToolMeta = {
  summary: string
  category?: string
  mutating?: boolean
  mirrors?: boolean
  capture?: ToolCaptureMode
  keywords?: readonly string[]
  positional?: string
  hint?: string
  icon?: ToolIconKey
  label?: ToolLabel
}

export type ToolErrorSpec = {message: string; data?: z.ZodType}
export type ToolErrors = Record<string, ToolErrorSpec>

export type ToolBinding = 'server' | 'client'

export type ToolError = Error & {readonly isToolError: true; code: string; data?: unknown}

export type ClientToolLocator = {ref?: string; selector?: string; name?: string}

export type ClientConsoleEntry = {level: string; ts: number; text: string}

export type ClientToolCtx = {
  document: Document
  target: (locator: ClientToolLocator) => Element
  resolve: (locator: ClientToolLocator) => Element | null
  addRef: (el: Element) => string
  resetRefs: () => void
  consoleEntries: (since?: number) => ClientConsoleEntry[]
  effects: readonly ClientEffect[]
}

export function toolError(code: string, options: {message?: string; data?: unknown} = {}): ToolError {
  return Object.assign(new Error(options.message ?? code), {isToolError: true as const, code, data: options.data})
}

export function isToolError(value: unknown): value is ToolError {
  return value instanceof Error && 'isToolError' in value && value.isToolError === true
}

export type ToolDefinition<
  Name extends string,
  Schema extends z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType,
  Errors extends ToolErrors = Record<never, never>,
> = {
  name: Name
  description: string
  inputSchema: Schema
  outputSchema?: Output
  errors?: Errors
  meta?: ToolMeta
  promptSnippet?: string
  promptGuidelines?: string[]
  streamTitle?: string
  display?: 'standalone'
  approval?: 'ask'
}

export function toolDefinition<
  const Name extends string,
  Schema extends z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType,
  Errors extends ToolErrors = Record<never, never>,
>(definition: ToolDefinition<Name, Schema, Output, Errors>): ToolDefinition<Name, Schema, Output, Errors> {
  return definition
}

export type ToolBuilder<
  Name extends string = string,
  Schema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType = z.ZodType,
  Errors extends ToolErrors = ToolErrors,
  Binding extends ToolBinding | undefined = ToolBinding | undefined,
  Ctx = unknown,
> = Omit<ExtensionTool, 'name' | 'inputSchema'> & {
  name: Name
  inputSchema: Schema
  outputSchema?: Output
  errors?: Errors
  meta?: ToolMeta
  binding?: Binding
  __ctx?: Ctx
  __clientExecute?: (input: unknown, ctx: ClientToolCtx) => Promise<unknown>
  server: <HandlerCtx>(
    execute: (
      input: z.infer<Schema>,
      ctx: HandlerCtx,
      request: ToolRequest,
      page: ServerToolPageAccess,
      tools: ServerToolRegistryAccess,
    ) => Promise<unknown> | unknown,
  ) => ToolBuilder<Name, Schema, Output, Errors, 'server', HandlerCtx>
  client: (
    execute?: (input: z.infer<Schema>, ctx: ClientToolCtx) => Promise<unknown> | unknown,
  ) => ToolBuilder<Name, Schema, Output, Errors, 'client', Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Name, Schema, Output, Errors, Binding, Ctx>
}

type ToolNameOf<Tool> = Tool extends {name: infer Name extends string} ? (string extends Name ? never : Name) : never

type ToolInputSchemaOf<Tool> = Tool extends {inputSchema: infer Schema extends z.ZodType} ? Schema : z.ZodNever

type ToolOutputSchemaOf<Tool> = Tool extends {outputSchema?: infer Schema}
  ? NonNullable<Schema> extends z.ZodType
    ? NonNullable<Schema>
    : z.ZodUnknown
  : z.ZodUnknown

type ToolErrorsOf<Tool> = Tool extends {errors?: infer Errors}
  ? NonNullable<Errors> extends ToolErrors
    ? NonNullable<Errors>
    : Record<never, never>
  : Record<never, never>

export type ProjectedToolBinding = ToolBinding | 'unknown'

type ToolBindingOf<Tool> = Tool extends {binding?: infer Binding}
  ? [Extract<Binding, ToolBinding>] extends [never]
    ? 'unknown'
    : Extract<Binding, ToolBinding>
  : 'unknown'

export type RegisteredTool<
  Schema extends z.ZodType,
  Output extends z.ZodType,
  Errors extends ToolErrors,
  Binding extends ProjectedToolBinding,
> = {
  inputSchema: Schema
  outputSchema: Output
  errors: Errors
  binding: Binding
}

export type ToolNameProblem<Message extends string> = {toolNameProblem: Message}

type ToolNamesIn<Tools extends readonly unknown[]> = ToolNameOf<Tools[number]>

type DuplicateToolName<Tools extends readonly unknown[]> = Tools extends readonly [infer Head, ...infer Rest]
  ? [ToolNameOf<Head>] extends [never]
    ? DuplicateToolName<Rest>
    : [ToolNameOf<Head>] extends [ToolNamesIn<Rest>]
      ? ToolNameOf<Head>
      : DuplicateToolName<Rest>
  : never

export type PrefixedToolNames<All extends string, Names extends string = All> = Names extends string
  ? [Extract<All, `${Names}.${string}`>] extends [never]
    ? never
    : Names
  : never

export type EmptySegmentToolNames<Names extends string> = Extract<
  Names,
  '' | `.${string}` | `${string}.` | `${string}..${string}`
>

export const FORBIDDEN_TOOL_SEGMENTS = ['__proto__', 'constructor', 'prototype'] as const

export type ForbiddenToolSegment = (typeof FORBIDDEN_TOOL_SEGMENTS)[number]

export type ForbiddenSegmentToolNames<Names extends string> = Extract<
  Names,
  | ForbiddenToolSegment
  | `${ForbiddenToolSegment}.${string}`
  | `${string}.${ForbiddenToolSegment}`
  | `${string}.${ForbiddenToolSegment}.${string}`
>

export type ToolNamePathProblem<Names extends string> =
  | ([PrefixedToolNames<Names>] extends [never]
      ? never
      : ToolNameProblem<`tool "${PrefixedToolNames<Names>}" is also the prefix of another tool name`>)
  | ([EmptySegmentToolNames<Names>] extends [never]
      ? never
      : ToolNameProblem<`tool name "${EmptySegmentToolNames<Names>}" has an empty path segment`>)
  | ([ForbiddenSegmentToolNames<Names>] extends [never]
      ? never
      : ToolNameProblem<`tool name "${ForbiddenSegmentToolNames<Names>}" uses a path segment that walks the prototype chain`>)

type ToolTupleProblem<Tools extends readonly unknown[]> =
  | ([DuplicateToolName<Tools>] extends [never]
      ? never
      : ToolNameProblem<`two tools are registered as "${DuplicateToolName<Tools>}"`>)
  | ToolNamePathProblem<ToolNamesIn<Tools>>

export type RegisteredTools<Tools extends readonly unknown[]> = [ToolTupleProblem<Tools>] extends [never]
  ? {
      [Tool in Tools[number] as ToolNameOf<Tool>]: RegisteredTool<
        ToolInputSchemaOf<Tool>,
        ToolOutputSchemaOf<Tool>,
        ToolErrorsOf<Tool>,
        ToolBindingOf<Tool>
      >
    }
  : ToolTupleProblem<Tools>

type ToolState<Binding extends ToolBinding | undefined> = {
  binding?: Binding
  execute?: (input: unknown, ctx?: unknown, request?: ToolRequest) => Promise<unknown>
  serverRun?: (
    input: unknown,
    ctx?: unknown,
    request?: ToolRequest,
    page?: ServerToolPageAccess,
    tools?: ServerToolRegistryAccess,
  ) => Promise<unknown>
  clientExecute?: (input: unknown, ctx: ClientToolCtx) => Promise<unknown>
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

function toolBuilder<
  Name extends string,
  Schema extends z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType,
  Errors extends ToolErrors,
  Binding extends ToolBinding | undefined,
  Ctx,
>(
  definition: ToolDefinition<Name, Schema, Output, Errors>,
  state: ToolState<Binding>,
): ToolBuilder<Name, Schema, Output, Errors, Binding, Ctx> {
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
    display: definition.display,
    approval: definition.approval,
    binding: state.binding,
    __execute: state.execute,
    __serverRun: state.serverRun,
    __clientExecute: state.clientExecute,
    __render: state.render,
    server<HandlerCtx>(
      execute: (
        input: z.infer<Schema>,
        ctx: HandlerCtx,
        request: ToolRequest,
        page: ServerToolPageAccess,
        tools: ServerToolRegistryAccess,
      ) => Promise<unknown> | unknown,
    ) {
      assertUnbound(definition.name, state.binding)
      const noPage: ServerToolPageAccess = {
        call: (name) => Promise.reject(new Error(`${name}: no widget connected`)),
      }
      const noTools: ServerToolRegistryAccess = {
        call: (name) => Promise.reject(new Error(`${name}: no tool registry available`)),
      }
      const invoke = async (
        parsed: z.infer<Schema>,
        ctx: unknown,
        request: ToolRequest | undefined,
        page: ServerToolPageAccess | undefined,
        tools: ServerToolRegistryAccess | undefined,
      ) => execute(parsed, ctx as HandlerCtx, request as ToolRequest, page ?? noPage, tools ?? noTools)
      return toolBuilder<Name, Schema, Output, Errors, 'server', HandlerCtx>(definition, {
        ...state,
        binding: 'server',
        execute: async (raw, ctx, request) =>
          invoke(definition.inputSchema.parse(raw), ctx, request, undefined, undefined),
        serverRun: async (input, ctx, request, page, tools) =>
          invoke(input as z.infer<Schema>, ctx, request, page, tools),
      })
    },
    client(execute) {
      assertUnbound(definition.name, state.binding)
      const clientState: ToolState<'client'> = {...state, binding: 'client'}
      if (execute === undefined) {
        return toolBuilder<Name, Schema, Output, Errors, 'client', Ctx>(definition, clientState)
      }
      return toolBuilder<Name, Schema, Output, Errors, 'client', Ctx>(definition, {
        ...clientState,
        clientExecute: async (raw, ctx) => execute(definition.inputSchema.parse(raw), ctx),
      })
    },
    render(renderer) {
      return toolBuilder<Name, Schema, Output, Errors, Binding, Ctx>(definition, {...state, render: renderer})
    },
  }
}

export function defineTool<
  const Name extends string,
  Schema extends z.ZodObject<z.ZodRawShape>,
  Output extends z.ZodType,
  Errors extends ToolErrors = Record<never, never>,
>(
  definition: ToolDefinition<Name, Schema, Output, Errors>,
): ToolBuilder<Name, Schema, Output, Errors, undefined, unknown> {
  assertToolMeta(definition.name, definition.meta)
  return toolBuilder<Name, Schema, Output, Errors, undefined, unknown>(definition, {})
}
