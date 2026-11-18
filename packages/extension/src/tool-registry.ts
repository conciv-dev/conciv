import {z} from 'zod'
import {TOOL_ICON_KEYS, type ToolIconKey, type ToolLabel} from '@conciv/protocol/tool-icon-types'
import type {ExtensionRegistry} from '@conciv/protocol/config-types'
import {
  createRouterClient,
  ORPCError,
  os,
  type AnyRouter,
  type ORPCErrorConstructorMap,
  type Procedure,
} from '@orpc/server'
import type {AnyToolBuilder} from './define-extension.js'
import {assertToolName, isToolError, type RegistryCallGate} from '@conciv/protocol/tool-call-types'
import {
  FORBIDDEN_TOOL_SEGMENTS,
  type ToolBinding,
  type ToolErrors,
  type ToolMeta,
  type ToolNamePathProblem,
  type ToolNameProblem,
} from './define-tool.js'
import {isRegistryBranch, walkRegistryProcedures, type RegistryWalkEntry} from './registry-walk.js'
import type {
  InferToolContext,
  ServerToolRegistryAccess,
  ToolMiddleware,
  ToolRequest,
  UnionToIntersection,
} from './types.js'

export type {ServerToolRegistryAccess} from './types.js'

export type RegistryToolMeta = ToolMeta & {name: string; binding: ToolBinding; approval?: 'ask'}

export type {RegistryCallGate} from '@conciv/protocol/tool-call-types'

export type RegistryCallContext = {request: ToolRequest; gate?: RegistryCallGate}

type RegisteredExtensionTools<Entry> = Entry extends {tools: infer Tools} ? Tools : Record<never, never>

type RegisteredToolsIn<Registry> = UnionToIntersection<RegisteredExtensionTools<Registry[keyof Registry]>>

type ToolPathHead<Path extends string> = Path extends `${infer Head}.${string}` ? Head : Path

type ToolPathTail<Path extends string, Head extends string> = Path extends `${Head}.${infer Tail}` ? Tail : never

type ToolProcedure<Tool> = Tool extends {
  inputSchema: infer Input extends z.ZodType
  outputSchema: infer Output extends z.ZodType
  errors: infer Errors extends ToolErrors
}
  ? Procedure<RegistryCallContext, RegistryCallContext, Input, Output, Errors, RegistryToolMeta>
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

export type ToolCatalogEntry = {
  name: string
  path: readonly string[]
  binding: ToolBinding
  summary: string
  category?: string
  hint?: string
  icon?: ToolIconKey
  label?: ToolLabel
  reachable: boolean
}

export type ToolSignatureError = {code: string; message: string}

export type ToolSignature = ToolCatalogEntry & {
  positional?: string
  approval?: 'ask'
  mutating: boolean
  keywords: readonly string[]
  inputSchema: unknown
  outputSchema: unknown
  errors: ToolSignatureError[]
}

export type ToolRegistration<Ctx> = unknown extends Ctx
  ? [registration: {owner: string; context?: Ctx; middleware?: ToolMiddleware}]
  : [registration: {owner: string; context: Ctx; middleware?: ToolMiddleware}]

export type SandboxTool = ToolSignature & {
  schema: z.ZodObject<z.ZodRawShape>
  run: (input: unknown, request: ToolRequest) => Promise<unknown>
}

export type ToolCatalog = {list: () => ToolCatalogEntry[]; get: (name: string) => ToolSignature}

export type ToolRegistry = {
  router: ExtensionToolRouter
  register: <Tool extends AnyToolBuilder>(tool: Tool, ...registration: ToolRegistration<InferToolContext<Tool>>) => void
  has: (name: string) => boolean
  call: (name: string, input: unknown, options: RegistryCallContext) => Promise<unknown>
  catalog: ToolCatalog
  sandboxTools: () => SandboxTool[]
}

export function createToolRegistry(): ToolRegistry {
  const router = emptyRouterNode<ExtensionToolRouter>()
  const owners = new Map<string, string>()
  const walked = (): RegistryWalkEntry[] => namedConsistently(walkRegistryProcedures(router))
  const has = (name: string): boolean => walked().some((entry) => entry.path.join('.') === name)
  const call: ToolRegistry['call'] = (name, input, callCtx) =>
    has(name) ? callTool(router, name, input, callCtx) : Promise.reject(new Error(`unknown tool "${name}"`))
  return {
    router,
    register: (tool: AnyToolBuilder, registration: ToolRegistrationEntry) =>
      registerTool(router, tool, call, registration, owners),
    has,
    call,
    catalog: {
      list: () => catalogEntries(walked()),
      get: (name: string) => toolSignature(walked(), name),
    },
    sandboxTools: () => sandboxToolList(router, walked()),
  }
}

function namedConsistently(entries: RegistryWalkEntry[]): RegistryWalkEntry[] {
  for (const entry of entries) {
    const path = entry.path.join('.')
    const declared = entry.meta['name']
    if (declared !== path) {
      throw new Error(
        `the registry procedure at "${path}" declares the tool name "${String(declared)}" and would be uncallable by that name; a declared name must match its registered path`,
      )
    }
  }
  return entries
}

function emptyRouterNode<Node>(): Node {
  return Object.create(null)
}

function toolMember(node: unknown, segment: string): unknown {
  if (node === null || (typeof node !== 'object' && typeof node !== 'function')) return undefined
  return Reflect.get(node, segment)
}

function callTool(
  router: ExtensionToolRouter,
  name: string,
  input: unknown,
  context: RegistryCallContext,
): Promise<unknown> {
  const dispatch: AnyRouter = router
  const client = createRouterClient(dispatch, {context})
  const target = name.split('.').reduce<unknown>(toolMember, client)
  if (typeof target !== 'function') return Promise.reject(new Error(`unknown tool "${name}"`))
  const result: unknown = target(input)
  return Promise.resolve(result)
}

type RegistryTool = AnyToolBuilder & {meta: ToolMeta; outputSchema: z.ZodType; binding: ToolBinding}

const REGISTRY_TOOL_REQUIREMENTS: {failed: (tool: AnyToolBuilder) => boolean; reason: string}[] = [
  {failed: (tool) => tool.meta === undefined, reason: 'registry tools declare meta with a summary'},
  {failed: (tool) => tool.outputSchema === undefined, reason: 'registry tools declare an outputSchema'},
  {
    failed: (tool) => tool.binding === undefined,
    reason: 'bind the tool with .server() before registering',
  },
]

function assertRegistryTool(tool: AnyToolBuilder): asserts tool is RegistryTool {
  const violated = REGISTRY_TOOL_REQUIREMENTS.find(({failed}) => failed(tool))
  if (violated) throw new Error(`tool "${tool.name}": ${violated.reason}`)
}

function assertPositionalField(tool: RegistryTool): void {
  const positional = tool.meta.positional
  if (positional === undefined) return
  if (positional in tool.inputSchema.shape) return
  throw new Error(
    `tool "${tool.name}": meta.positional names "${positional}" but the input schema declares no such field`,
  )
}

function assertToolCosmetics(tool: RegistryTool): void {
  const parsed = StrictToolCosmetics.safeParse(tool.meta)
  if (parsed.success) return
  throw new Error(
    `tool "${tool.name}": meta.icon must be one of ${TOOL_ICON_KEYS.join(', ')} and meta.label must carry non-empty running and done text: ${parsed.error.message}`,
  )
}

function registerTool(
  router: Record<string, AnyRouter>,
  tool: AnyToolBuilder,
  call: ToolRegistry['call'],
  registration: ToolRegistrationEntry,
  owners: Map<string, string>,
): void {
  assertToolName(tool.name)
  assertRegistryTool(tool)
  assertToolCosmetics(tool)
  assertPositionalField(tool)
  toInlineJsonSchema(tool.inputSchema, `tool "${tool.name}" input`, 'input')
  toInlineJsonSchema(tool.outputSchema, `tool "${tool.name}" output`, 'output')
  const holder = owners.get(tool.name)
  if (holder !== undefined) {
    throw new Error(`tool "${tool.name}" is declared by both ${holder} and ${registration.owner}`)
  }
  insertProcedure(router, tool.name.split('.'), compileTool(tool, call, registration))
  owners.set(tool.name, registration.owner)
}

function insertProcedure(router: Record<string, AnyRouter>, segments: string[], procedure: AnyRouter): void {
  const leaf = segments.at(-1)
  if (leaf === undefined || segments.some((segment) => segment === '')) {
    throw new Error('tool names use non-empty dot-separated segments')
  }
  const name = segments.join('.')
  const forbidden = segments.find((segment) => FORBIDDEN_TOOL_SEGMENTS.some((reserved) => reserved === segment))
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

type ToolRegistrationEntry = {owner: string; context?: unknown; middleware?: ToolMiddleware}

const passThrough: ToolMiddleware = ({next}) => next()

type Admission = {admitted: boolean; refusal: unknown}

const admitAll: RegistryCallGate = (run) => run()

function unadmitted(name: string): ORPCError<'FORBIDDEN', unknown> {
  return new ORPCError('FORBIDDEN', {
    message: `tool "${name}": its extension middleware answered the call before conciv admitted it`,
  })
}

function compileTool(
  tool: RegistryTool,
  callTool: ToolRegistry['call'],
  registration: ToolRegistrationEntry,
): AnyRouter {
  const context = registration.context
  const meta: RegistryToolMeta = {
    ...tool.meta,
    name: tool.name,
    binding: tool.binding,
    ...(tool.approval === undefined ? {} : {approval: tool.approval}),
  }
  const declaredErrors: ToolErrors = tool.errors ?? {}
  const procedure = registryBase
    .use(async ({next}) => {
      const admission: Admission = {admitted: false, refusal: null}
      const result = await next({context: {admission}})
      if (admission.admitted) return result
      throw admission.refusal ?? unadmitted(tool.name)
    })
    .use(registration.middleware ?? passThrough)
    .use(async ({context: call, next}, _input, output) => {
      const admitted = async () => {
        call.admission.admitted = true
        return (await next()).output
      }
      const gate = call.gate ?? admitAll
      try {
        return output(await gate(admitted))
      } catch (error) {
        if (!call.admission.admitted) call.admission.refusal = error
        throw error
      }
    })
    .meta(meta)
    .errors(declaredErrors)
    .input(tool.inputSchema)
    .output(tool.outputSchema)
  return procedure.handler(({input, errors, context: called}) =>
    runServerTool(tool, input, context, called.request, declaredErrors, errors, callTool),
  )
}

function toolsAccess(call: ToolRegistry['call'], request: ToolRequest): ServerToolRegistryAccess {
  return {call: (name, input) => call(name, input, {request})}
}

async function runServerTool(
  tool: RegistryTool,
  input: unknown,
  context: unknown,
  request: ToolRequest,
  declaredErrors: ToolErrors,
  errors: ToolErrorConstructors,
  call: ToolRegistry['call'],
): Promise<unknown> {
  const run = tool.__serverRun
  if (run === undefined) throw new Error(`tool "${tool.name}" has no server handler`)
  try {
    return await run(input, context, request, toolsAccess(call, request))
  } catch (error) {
    throw declaredError(tool, declaredErrors, error, errors) ?? error
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

const RegistryToolMetaSchema = z.object({
  name: z.string().min(1),
  binding: z.literal('server'),
  summary: z.string().min(1),
  approval: z.literal('ask').optional(),
  category: z.string().optional(),
  mutating: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
  positional: z.string().optional(),
  hint: z.string().optional(),
  icon: z.string().optional(),
  label: z.object({running: z.string(), done: z.string()}).optional(),
})

const StrictToolCosmetics = z.object({
  icon: z.enum(TOOL_ICON_KEYS).optional(),
  label: z.object({running: z.string().min(1), done: z.string().min(1)}).optional(),
})

function knownIconKey(icon: string | undefined): ToolIconKey | undefined {
  return TOOL_ICON_KEYS.find((known) => known === icon)
}

function readToolMeta(entry: RegistryWalkEntry): z.infer<typeof RegistryToolMetaSchema> {
  const parsed = RegistryToolMetaSchema.safeParse(entry.meta)
  if (!parsed.success) {
    throw new Error(
      `registry procedure at "${entry.path.join('.')}" carries unreadable tool metadata: ${parsed.error.message}`,
    )
  }
  return parsed.data
}

function catalogEntries(entries: RegistryWalkEntry[]): ToolCatalogEntry[] {
  return entries.map((entry) => {
    const meta = readToolMeta(entry)
    return {
      name: meta.name,
      path: entry.path,
      binding: meta.binding,
      summary: meta.summary,
      category: meta.category,
      hint: meta.hint,
      icon: knownIconKey(meta.icon),
      label: meta.label,
      reachable: true,
    }
  })
}

function buildSignature(entry: RegistryWalkEntry, listed: ToolCatalogEntry): ToolSignature {
  const meta = readToolMeta(entry)
  return {
    ...listed,
    positional: meta.positional,
    approval: meta.approval,
    mutating: meta.mutating ?? false,
    keywords: meta.keywords ?? [],
    inputSchema: toInlineJsonSchema(entry.inputSchema, `tool "${listed.name}" input`, 'input'),
    outputSchema: toInlineJsonSchema(entry.outputSchema, `tool "${listed.name}" output`, 'output'),
    errors: declaredErrorList(entry),
  }
}

function toolSignature(walked: RegistryWalkEntry[], name: string): ToolSignature {
  const index = walked.findIndex((candidate) => candidate.path.join('.') === name)
  const entry = walked[index]
  const listed = catalogEntries(walked)[index]
  if (entry === undefined || listed === undefined) throw new Error(`unknown tool "${name}"`)
  return buildSignature(entry, listed)
}

function isObjectSchema(schema: unknown): schema is z.ZodObject<z.ZodRawShape> {
  return isZodSchema(schema) && typeof Reflect.get(schema, 'shape') === 'object'
}

function sandboxToolList(router: ExtensionToolRouter, walked: RegistryWalkEntry[]): SandboxTool[] {
  const listed = catalogEntries(walked)
  return walked.map((entry, index) => {
    const base = listed[index]
    if (base === undefined) throw new Error('the catalog drifted from the registry walk')
    if (!isObjectSchema(entry.inputSchema)) throw new Error(`tool "${base.name}" input: not an object schema`)
    return {
      ...buildSignature(entry, base),
      schema: entry.inputSchema,
      run: (input, request) => callTool(router, base.name, input, {request}),
    }
  })
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && '_zod' in schema
}

function carriesDefs(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '$defs' in value
}

export function toInlineJsonSchema(schema: unknown, where: string, io: 'input' | 'output'): unknown {
  if (!isZodSchema(schema)) throw new Error(`${where}: not a zod schema`)
  const converted = convertOrExplain(schema, where, io)
  if (!carriesDefs(converted)) return converted
  throw new Error(
    `${where}: the schema tags a sub-schema with .meta({id}), so zod serializes it as $ref plus $defs; the sandbox reads one inline schema, so drop the id`,
  )
}

function convertOrExplain(schema: z.ZodType, where: string, io: 'input' | 'output'): unknown {
  try {
    return z.toJSONSchema(schema, {io, cycles: 'throw'})
  } catch (error) {
    throw new Error(`${where}: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
  }
}

function declaredErrorList(entry: RegistryWalkEntry): ToolSignatureError[] {
  return Object.entries(entry.errorMap).map(([code, spec]) => ({
    code,
    message: spec?.message ?? '',
  }))
}
