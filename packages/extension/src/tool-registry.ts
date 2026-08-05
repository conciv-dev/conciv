import {z} from 'zod'
import type {PageErrorCode} from '@conciv/protocol/page-types'
import type {ExtensionRegistry} from '@conciv/protocol/config-types'
import {os, type AnyRouter, type ORPCErrorConstructorMap, type Procedure} from '@orpc/server'
import type {AnyToolBuilder} from './define-extension.js'
import {
  isToolError,
  type ToolBinding,
  type ToolErrors,
  type ToolMeta,
  type ToolNamePathProblem,
  type ToolNameProblem,
} from './define-tool.js'
import {isPageVerbError} from './page-verbs.js'
import {isRegistryBranch, walkRegistryProcedures, type RegistryWalkEntry} from './registry-walk.js'
import {sanitizeIdentifier, uniqueIdentifier} from './sanitize-identifier.js'
import type {CtxOf, ToolRequest, UnionToIntersection} from './types.js'

export type RegistryToolMeta = ToolMeta & {name: string; binding: ToolBinding}

export type RegistryCallContext = {request?: ToolRequest}

type RegisteredExtensionTools<Entry> = Entry extends {tools: infer Tools} ? Tools : Record<never, never>

type RegisteredToolsIn<Registry> = UnionToIntersection<RegisteredExtensionTools<Registry[keyof Registry]>>

type ToolPathHead<Path extends string> = Path extends `${infer Head}.${string}` ? Head : Path

type ToolPathTail<Path extends string, Head extends string> = Path extends `${Head}.${infer Tail}` ? Tail : never

type ToolProcedure<Tool> = Tool extends {
  inputSchema: infer Input extends z.ZodType
  outputSchema: infer Output extends z.ZodType
}
  ? Procedure<RegistryCallContext, RegistryCallContext, Input, Output, Record<never, never>, RegistryToolMeta>
  : never

type ToolRouterNode<Tools> = {
  [Head in ToolPathHead<Extract<keyof Tools, string>>]: Head extends keyof Tools
    ? ToolProcedure<Tools[Head]>
    : ToolRouterNode<{[Path in keyof Tools as ToolPathTail<Extract<Path, string>, Head>]: Tools[Path]}>
}

type ToolNamesOfExtension<Registry, Name extends keyof Registry> = Extract<
  keyof RegisteredExtensionTools<Registry[Name]>,
  string
>

type ToolNamesAcross<Registry, Names extends keyof Registry> = Names extends unknown
  ? ToolNamesOfExtension<Registry, Names>
  : never

type SharedToolNames<Registry, Names extends keyof Registry = keyof Registry> = Names extends unknown
  ? Extract<ToolNamesOfExtension<Registry, Names>, ToolNamesAcross<Registry, Exclude<keyof Registry, Names>>>
  : never

type ToolNameProblemMessage<Tools> = Tools extends ToolNameProblem<infer Message extends string> ? Message : never

type RegistryNameProblem<Registry> =
  | ([ToolNameProblemMessage<RegisteredToolsIn<Registry>>] extends [never]
      ? never
      : ToolNameProblem<ToolNameProblemMessage<RegisteredToolsIn<Registry>>>)
  | ([SharedToolNames<Registry>] extends [never]
      ? never
      : ToolNameProblem<`two extensions register a tool named "${SharedToolNames<Registry>}"`>)
  | ToolNamePathProblem<ToolNamesAcross<Registry, keyof Registry>>

export type ToolRouterFor<Registry> = [RegistryNameProblem<Registry>] extends [never]
  ? ToolRouterNode<RegisteredToolsIn<Registry>>
  : RegistryNameProblem<Registry>

export type ExtensionToolRouter = ToolRouterFor<ExtensionRegistry>

export const TOOL_TRANSPORT_ERRORS: ToolErrors = {
  NO_PAGE_CLIENT: {message: 'no widget connected'},
  PAGE_TIMEOUT: {message: 'the page did not reply in time'},
  UNKNOWN_TOOL: {message: 'the page does not know this tool'},
  INVALID_ARGS: {message: 'the page rejected the arguments'},
}

const PAGE_FAILURE_TO_TRANSPORT: Partial<Record<PageErrorCode, string>> = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_TOOL',
  'invalid-args': 'INVALID_ARGS',
}

export type RegistryPageCaller = (tool: string, input: unknown) => Promise<unknown>

export type ToolCatalogEntry = {
  name: string
  path: readonly string[]
  sandboxBinding: string
  binding: ToolBinding
  summary: string
  reachable: boolean
}

export type ToolSignatureError = {code: string; message: string; transport: boolean}

export type ToolSignature = ToolCatalogEntry & {
  category?: string
  mutating: boolean
  mirrors: boolean
  keywords: readonly string[]
  input: unknown
  output: unknown
  errors: ToolSignatureError[]
}

export type ToolRegistry = {
  router: ExtensionToolRouter
  register: <Tool extends AnyToolBuilder>(tool: Tool, options?: {context?: CtxOf<Tool>}) => void
  catalog: {list: () => ToolCatalogEntry[]; get: (name: string) => ToolSignature}
}

export function createToolRegistry(
  options: {pageCaller?: RegistryPageCaller; isPageConnected?: () => boolean} = {},
): ToolRegistry {
  const router = emptyRouterNode<ExtensionToolRouter>()
  const pageCaller = options.pageCaller
  const pageConnected = options.isPageConnected ?? (() => pageCaller !== undefined)
  return {
    router,
    register: (tool, registration = {}) => registerTool(router, tool, pageCaller, registration.context),
    catalog: {
      list: () => catalogEntries(walkRegistryProcedures(router), pageConnected()),
      get: (name) => toolSignature(router, name, pageConnected()),
    },
  }
}

function emptyRouterNode<Node>(): Node {
  return Object.create(null)
}

type RegistryTool = AnyToolBuilder & {meta: ToolMeta; outputSchema: z.ZodType; binding: ToolBinding}

const REGISTRY_TOOL_REQUIREMENTS: {failed: (tool: AnyToolBuilder) => boolean; reason: string}[] = [
  {failed: (tool) => tool.meta === undefined, reason: 'registry tools declare meta with a summary'},
  {failed: (tool) => tool.outputSchema === undefined, reason: 'registry tools declare an outputSchema'},
  {
    failed: (tool) => tool.binding === undefined,
    reason: 'bind the tool with .server() or .client() before registering',
  },
  {
    failed: (tool) => Object.keys(tool.errors ?? {}).some((code) => code in TOOL_TRANSPORT_ERRORS),
    reason: 'transport error codes belong to the forwarding layer, not to a tool',
  },
]

function assertRegistryTool(tool: AnyToolBuilder): asserts tool is RegistryTool {
  const violated = REGISTRY_TOOL_REQUIREMENTS.find(({failed}) => failed(tool))
  if (violated) throw new Error(`tool "${tool.name}": ${violated.reason}`)
}

function registerTool(
  router: Record<string, AnyRouter>,
  tool: AnyToolBuilder,
  pageCaller: RegistryPageCaller | undefined,
  context: unknown,
): void {
  assertRegistryTool(tool)
  toJsonSchema(tool.inputSchema, `tool "${tool.name}" input`, 'input')
  toJsonSchema(tool.outputSchema, `tool "${tool.name}" output`, 'output')
  insertProcedure(router, tool.name.split('.'), compileTool(tool, pageCaller, context))
}

const FORBIDDEN_SEGMENTS = ['__proto__', 'constructor', 'prototype']

function insertProcedure(router: Record<string, AnyRouter>, segments: string[], procedure: AnyRouter): void {
  const leaf = segments.at(-1)
  if (leaf === undefined || segments.some((segment) => segment === '')) {
    throw new Error('tool names use non-empty dot-separated segments')
  }
  const name = segments.join('.')
  const forbidden = segments.find((segment) => FORBIDDEN_SEGMENTS.includes(segment))
  if (forbidden !== undefined) throw new Error(`tool "${name}": "${forbidden}" is a forbidden path segment`)
  const parent = segments.slice(0, -1).reduce(ensureBranch, router)
  const existing = parent[leaf]
  if (existing === undefined) {
    parent[leaf] = procedure
    return
  }
  if (isRegistryBranch(existing)) {
    throw new Error(`tool "${name}" would overwrite the tools registered under "${name}"`)
  }
  throw new Error(`tool "${name}" is already registered`)
}

function ensureBranch(node: Record<string, AnyRouter>, segment: string): Record<string, AnyRouter> {
  const existing = node[segment]
  if (existing === undefined) {
    const branch = emptyRouterNode<Record<string, AnyRouter>>()
    node[segment] = branch
    return branch
  }
  if (isRegistryBranch(existing)) return existing
  throw new Error(`"${segment}" already names a registered tool`)
}

const registryBase = os
  .$context<RegistryCallContext>()
  .$meta<RegistryToolMeta>({name: '', binding: 'server', summary: ''})

type ToolErrorConstructors = ORPCErrorConstructorMap<ToolErrors>

function compileTool(tool: RegistryTool, pageCaller: RegistryPageCaller | undefined, context: unknown): AnyRouter {
  const meta: RegistryToolMeta = {...tool.meta, name: tool.name, binding: tool.binding}
  const declaredErrors: ToolErrors =
    tool.binding === 'client' ? {...tool.errors, ...TOOL_TRANSPORT_ERRORS} : (tool.errors ?? {})
  const procedure = registryBase.meta(meta).errors(declaredErrors).input(tool.inputSchema).output(tool.outputSchema)
  if (tool.binding === 'server') {
    return procedure.handler(({input, errors, context: call}) =>
      runServerTool(tool, input, context, call.request, declaredErrors, errors),
    )
  }
  return procedure.handler(({input, errors}) => forwardToolToPage(tool, input, declaredErrors, errors, pageCaller))
}

async function runServerTool(
  tool: RegistryTool,
  input: unknown,
  context: unknown,
  request: ToolRequest | undefined,
  declaredErrors: ToolErrors,
  errors: ToolErrorConstructors,
): Promise<unknown> {
  const run = tool.__serverRun
  if (run === undefined) throw new Error(`tool "${tool.name}" has no server handler`)
  try {
    return await run(input, context, request)
  } catch (error) {
    throw declaredError(tool, declaredErrors, error, errors) ?? error
  }
}

async function forwardToolToPage(
  tool: RegistryTool,
  input: unknown,
  declaredErrors: ToolErrors,
  errors: ToolErrorConstructors,
  pageCaller: RegistryPageCaller | undefined,
): Promise<unknown> {
  if (pageCaller === undefined) throw transportError(errors, 'NO_PAGE_CLIENT', `${tool.name}: no widget connected`)
  try {
    return await pageCaller(tool.name, input)
  } catch (error) {
    throw pageFailure(tool, declaredErrors, error, errors)
  }
}

function declaredError(
  tool: RegistryTool,
  declaredErrors: ToolErrors,
  error: unknown,
  errors: ToolErrorConstructors,
): Error | undefined {
  if (!isToolError(error)) return undefined
  const spec = declaredErrors[error.code]
  if (spec === undefined) return undefined
  if (spec.data === undefined) return errors[error.code]?.({message: error.message, data: error.data})
  const parsed = spec.data.safeParse(error.data)
  if (!parsed.success) {
    return new Error(
      `tool "${tool.name}": error "${error.code}" was thrown with data that does not match its declared schema: ${parsed.error.message}`,
    )
  }
  return errors[error.code]?.({message: error.message, data: parsed.data})
}

function transportError(errors: ToolErrorConstructors, code: string, message: string): Error {
  const construct = errors[code]
  if (construct === undefined) throw new Error(`transport error "${code}" is not declared on this tool`)
  return construct({message})
}

function pageFailure(
  tool: RegistryTool,
  declaredErrors: ToolErrors,
  error: unknown,
  errors: ToolErrorConstructors,
): unknown {
  const declared = declaredError(tool, declaredErrors, error, errors)
  if (declared !== undefined) return declared
  if (!isPageVerbError(error)) return error
  const transport = PAGE_FAILURE_TO_TRANSPORT[error.code]
  if (transport === undefined) return error
  return transportError(errors, transport, error.message)
}

const RegistryToolMetaSchema = z.object({
  name: z.string().min(1),
  binding: z.enum(['server', 'client']),
  summary: z.string().min(1),
  category: z.string().optional(),
  mutating: z.boolean().optional(),
  mirrors: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
})

function readToolMeta(entry: RegistryWalkEntry): z.infer<typeof RegistryToolMetaSchema> {
  const parsed = RegistryToolMetaSchema.safeParse(entry.meta)
  if (!parsed.success) {
    throw new Error(`registry procedure at "${entry.path.join('.')}" carries no tool metadata`)
  }
  return parsed.data
}

function catalogEntries(entries: RegistryWalkEntry[], pageConnected: boolean): ToolCatalogEntry[] {
  const taken = new Set<string>()
  return entries.map((entry) => {
    const meta = readToolMeta(entry)
    const sandboxBinding = uniqueIdentifier(sanitizeIdentifier(meta.name), taken)
    taken.add(sandboxBinding)
    return {
      name: meta.name,
      path: entry.path,
      sandboxBinding,
      binding: meta.binding,
      summary: meta.summary,
      reachable: meta.binding === 'server' || pageConnected,
    }
  })
}

function toolSignature(router: Record<string, AnyRouter>, name: string, pageConnected: boolean): ToolSignature {
  const walked = walkRegistryProcedures(router)
  const index = walked.findIndex((candidate) => candidate.path.join('.') === name)
  const entry = walked[index]
  const listed = catalogEntries(walked, pageConnected)[index]
  if (entry === undefined || listed === undefined) throw new Error(`unknown tool "${name}"`)
  const meta = readToolMeta(entry)
  return {
    ...listed,
    category: meta.category,
    mutating: meta.mutating ?? false,
    mirrors: meta.mirrors ?? false,
    keywords: meta.keywords ?? [],
    input: toJsonSchema(entry.inputSchema, `tool "${name}" input`, 'input'),
    output: toJsonSchema(entry.outputSchema, `tool "${name}" output`, 'output'),
    errors: declaredErrorList(entry),
  }
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && '_zod' in schema
}

function toJsonSchema(schema: unknown, where: string, io: 'input' | 'output'): unknown {
  if (!isZodSchema(schema)) throw new Error(`${where}: not a zod schema`)
  try {
    return z.toJSONSchema(schema, {io})
  } catch (error) {
    throw new Error(`${where}: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
  }
}

function declaredErrorList(entry: RegistryWalkEntry): ToolSignatureError[] {
  return Object.entries(entry.errorMap).map(([code, spec]) => ({
    code,
    message: spec?.message ?? '',
    transport: code in TOOL_TRANSPORT_ERRORS,
  }))
}
