import {z} from 'zod'
import {os, type AnyRouter, type ORPCErrorConstructorMap} from '@orpc/server'
import type {AnyToolBuilder} from './define-extension.js'
import {isToolError, type ToolBinding, type ToolErrors, type ToolMeta} from './define-tool.js'
import {isPageVerbError, type PageVerbErrorCode} from './page-verbs.js'
import {isRegistryBranch, walkRegistryProcedures, type RegistryWalkEntry} from './registry-walk.js'
import {sanitizeIdentifier} from './sanitize-identifier.js'

export type RegistryToolMeta = ToolMeta & {name: string; binding: ToolBinding}

export const TOOL_TRANSPORT_ERRORS: ToolErrors = {
  NO_PAGE_CLIENT: {message: 'no widget connected'},
  PAGE_TIMEOUT: {message: 'the page did not reply in time'},
  UNKNOWN_TOOL: {message: 'the page does not know this tool'},
  INVALID_ARGS: {message: 'the page rejected the arguments'},
}

const PAGE_FAILURE_TO_TRANSPORT: Partial<Record<PageVerbErrorCode, string>> = {
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
  router: Record<string, AnyRouter>
  register: (tool: AnyToolBuilder) => void
  catalog: {list: () => ToolCatalogEntry[]; get: (name: string) => ToolSignature}
}

export function createToolRegistry(options: {pageCaller?: RegistryPageCaller} = {}): ToolRegistry {
  const router: Record<string, AnyRouter> = {}
  const pageCaller = options.pageCaller
  return {
    router,
    register: (tool) => registerTool(router, tool, pageCaller),
    catalog: {
      list: () => walkRegistryProcedures(router).map((entry) => catalogEntry(entry, pageCaller !== undefined)),
      get: (name) => toolSignature(router, name, pageCaller !== undefined),
    },
  }
}

type RegistryTool = AnyToolBuilder & {meta: ToolMeta; outputSchema: z.ZodType; binding: ToolBinding}

const REGISTRY_TOOL_REQUIREMENTS: [(tool: AnyToolBuilder) => boolean, string][] = [
  [(tool) => tool.meta === undefined, 'registry tools declare meta with a summary'],
  [(tool) => tool.outputSchema === undefined, 'registry tools declare an outputSchema'],
  [(tool) => tool.binding === undefined, 'bind the tool with .server() or .client() before registering'],
  [
    (tool) => Object.keys(tool.errors ?? {}).some((code) => code in TOOL_TRANSPORT_ERRORS),
    'transport error codes belong to the forwarding layer, not to a tool',
  ],
]

function assertRegistryTool(tool: AnyToolBuilder): asserts tool is RegistryTool {
  const violated = REGISTRY_TOOL_REQUIREMENTS.find(([check]) => check(tool))
  if (violated) throw new Error(`tool "${tool.name}": ${violated[1]}`)
}

function registerTool(
  router: Record<string, AnyRouter>,
  tool: AnyToolBuilder,
  pageCaller: RegistryPageCaller | undefined,
): void {
  assertRegistryTool(tool)
  const taken = walkRegistryProcedures(router).some((entry) => entry.path.join('.') === tool.name)
  if (taken) throw new Error(`tool "${tool.name}" is already registered`)
  insertProcedure(router, tool.name.split('.'), compileTool(tool, pageCaller))
}

function insertProcedure(router: Record<string, AnyRouter>, segments: string[], procedure: AnyRouter): void {
  const leaf = segments.at(-1)
  if (leaf === undefined || segments.some((segment) => segment === '')) {
    throw new Error('tool names use non-empty dot-separated segments')
  }
  const parent = segments.slice(0, -1).reduce(ensureBranch, router)
  parent[leaf] = procedure
}

function ensureBranch(node: Record<string, AnyRouter>, segment: string): Record<string, AnyRouter> {
  const existing = node[segment]
  if (existing === undefined) {
    const branch: Record<string, AnyRouter> = {}
    node[segment] = branch
    return branch
  }
  if (isRegistryBranch(existing)) return existing
  throw new Error(`"${segment}" already names a registered tool`)
}

const registryBase = os.$meta<RegistryToolMeta>({name: '', binding: 'server', summary: ''})

type ToolErrorConstructors = ORPCErrorConstructorMap<ToolErrors>

function compileTool(tool: RegistryTool, pageCaller: RegistryPageCaller | undefined): AnyRouter {
  const meta: RegistryToolMeta = {...tool.meta, name: tool.name, binding: tool.binding}
  const declaredErrors: ToolErrors =
    tool.binding === 'client' ? {...tool.errors, ...TOOL_TRANSPORT_ERRORS} : (tool.errors ?? {})
  const procedure = registryBase.meta(meta).errors(declaredErrors).input(tool.inputSchema).output(tool.outputSchema)
  if (tool.binding === 'server') {
    return procedure.handler(({input, errors}) => runServerTool(tool, input, errors))
  }
  return procedure.handler(({input, errors}) => forwardToolToPage(tool, input, errors, pageCaller))
}

async function runServerTool(tool: RegistryTool, input: unknown, errors: ToolErrorConstructors): Promise<unknown> {
  const execute = tool.__execute
  if (execute === undefined) throw new Error(`tool "${tool.name}" has no server handler`)
  try {
    return await execute(input)
  } catch (error) {
    throw declaredError(error, errors) ?? error
  }
}

async function forwardToolToPage(
  tool: RegistryTool,
  input: unknown,
  errors: ToolErrorConstructors,
  pageCaller: RegistryPageCaller | undefined,
): Promise<unknown> {
  if (pageCaller === undefined) throw raiseTransport(errors, 'NO_PAGE_CLIENT', `${tool.name}: no widget connected`)
  try {
    return await pageCaller(tool.name, input)
  } catch (error) {
    throw pageFailure(error, errors)
  }
}

function declaredError(error: unknown, errors: ToolErrorConstructors): Error | undefined {
  if (!isToolError(error)) return undefined
  const construct = errors[error.code]
  if (construct === undefined) return undefined
  return construct({message: error.message, data: error.data})
}

function raiseTransport(errors: ToolErrorConstructors, code: string, message: string): Error {
  const construct = errors[code]
  if (construct === undefined) return new Error(message)
  return construct({message})
}

function pageFailure(error: unknown, errors: ToolErrorConstructors): unknown {
  const declared = declaredError(error, errors)
  if (declared !== undefined) return declared
  if (!isPageVerbError(error)) return error
  const transport = PAGE_FAILURE_TO_TRANSPORT[error.code]
  if (transport === undefined) return error
  return raiseTransport(errors, transport, error.message)
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

function catalogEntry(entry: RegistryWalkEntry, pageConnected: boolean): ToolCatalogEntry {
  const meta = readToolMeta(entry)
  return {
    name: meta.name,
    path: entry.path,
    sandboxBinding: sanitizeIdentifier(meta.name),
    binding: meta.binding,
    summary: meta.summary,
    reachable: meta.binding === 'server' || pageConnected,
  }
}

function toolSignature(router: Record<string, AnyRouter>, name: string, pageConnected: boolean): ToolSignature {
  const entry = walkRegistryProcedures(router).find((candidate) => candidate.path.join('.') === name)
  if (entry === undefined) throw new Error(`unknown tool "${name}"`)
  const meta = readToolMeta(entry)
  return {
    ...catalogEntry(entry, pageConnected),
    category: meta.category,
    mutating: meta.mutating ?? false,
    mirrors: meta.mirrors ?? false,
    keywords: meta.keywords ?? [],
    input: toJsonSchema(entry.inputSchema, `tool "${name}" input`),
    output: toJsonSchema(entry.outputSchema, `tool "${name}" output`),
    errors: declaredErrorList(entry),
  }
}

function toJsonSchema(schema: unknown, where: string): unknown {
  if (!(schema instanceof z.ZodType)) throw new Error(`${where}: not a zod schema`)
  return z.toJSONSchema(schema)
}

function declaredErrorList(entry: RegistryWalkEntry): ToolSignatureError[] {
  return Object.entries(entry.errorMap).map(([code, spec]) => ({
    code,
    message: spec?.message ?? '',
    transport: code in TOOL_TRANSPORT_ERRORS,
  }))
}
