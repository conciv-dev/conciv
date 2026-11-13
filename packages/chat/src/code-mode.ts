import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {Cause, Effect, Exit, Option, Result, Schema} from 'effect'
import {approvalDenied, describeSchemas} from '@conciv/ai/server'
import {cappedValue} from '@conciv/contract'
import {
  Agent,
  CodeMode,
  CodeModeCatalog,
  CodeModeToolRuntime,
  Permission,
  Session,
  Tool,
  ToolRuntime,
} from '@conciv/plugin-host'
import {defineTool, type ChatTool} from '@conciv/protocol/chat-tool-types'
import type {ToolRequest} from '@conciv/extension'
import {type SandboxTool} from '@conciv/extension/registry'
import type {ConcivServerTool} from '@conciv/tools'

type SchemaInput = NonNullable<Parameters<typeof defineTool>[0]['inputSchema']>

type CodeNamespace = {name: string; description: string}

export type CodeCapability = {
  name: string
  path: string
  namespaces?: readonly CodeNamespace[]
  pinned?: true
  description: string
  approval?: 'ask'
  direct?: true
  errors: {code: string; message: string}[]
  inputSchema: SchemaInput
  outputSchema?: SchemaInput
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
}

const JsonSchemaObject = z.record(z.string(), z.unknown())

const PLUGIN_TEXT_OUTPUT: SchemaInput = {type: ['string', 'null']}

export type CapabilityCall = (name: string, input: unknown, request: ToolRequest) => Promise<unknown>

function discoverableDescription(tool: SandboxTool): string {
  const summary = tool.hint === undefined ? tool.summary : `${tool.summary}. ${tool.hint}`
  const errors = tool.errors.map(({code, message}) => `${code}: ${message}`).join('; ')
  return [
    /[.!?]$/.test(summary) ? summary : `${summary}.`,
    `Returns JSON matching: ${JSON.stringify(tool.outputSchema)}`,
    ...(errors === '' ? [] : [`Declared errors: ${errors}`]),
  ].join('\n\n')
}

export function registryCapabilities(tools: readonly SandboxTool[], call: CapabilityCall): CodeCapability[] {
  return tools.map((tool) => ({
    name: tool.name,
    path: tool.name,
    description: discoverableDescription(tool),
    ...(tool.approval === undefined ? {} : {approval: tool.approval}),
    errors: tool.errors.map(({code, message}) => ({code, message})),
    inputSchema: tool.schema,
    ...registryOutput(tool.outputSchema),
    execute: (input, request) => call(tool.name, input, request),
  }))
}

function registryOutput(schema: unknown): {outputSchema?: SchemaInput} {
  const parsed = JsonSchemaObject.safeParse(schema)
  return parsed.success ? {outputSchema: parsed.data} : {}
}

export function assistCapabilities(tools: ConcivServerTool[]): CodeCapability[] {
  return tools.map((tool) => ({
    name: tool.name,
    path: tool.name,
    description: tool.description,
    errors: [],
    inputSchema: tool.inputSchema,
    execute: (input) => tool.execute(input),
  }))
}

type EffectRun = <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal | undefined) => Promise<Exit.Exit<A, E>>

function jsonSchemaOnly(schema: ReturnType<typeof ToolRuntime.definition>['inputSchema']): SchemaInput {
  return {...schema}
}

function waitForCancel(signal: AbortSignal): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    const settle = () => resume(Effect.void)
    if (signal.aborted) return settle()
    signal.addEventListener('abort', settle, {once: true})
    return Effect.sync(() => signal.removeEventListener('abort', settle))
  })
}

function toolContext(request: ToolRequest): Tool.Context {
  return {
    sessionId: Session.Id.make(request.sessionId),
    agent: Agent.defaultId,
    messageId: undefined,
    id: Tool.CallId.make(request.toolCallId ?? randomUUID()),
    progress: () => Effect.void,
    ...(request.signal === undefined ? {} : {cancel: waitForCancel(request.signal)}),
  }
}

const isDeclined = Schema.is(Permission.DeclinedError)

function refusal(name: string, cause: Cause.Cause<Tool.Error>): unknown {
  const defect = Cause.findDefect(cause)
  if (Result.isSuccess(defect)) return isDeclined(defect.success) ? approvalDenied(name) : defect.success
  const failure = Cause.findErrorOption(cause)
  if (Option.isSome(failure)) return new Error(failure.value.message)
  return Cause.squash(cause)
}

async function runTool(
  name: string,
  run: EffectRun,
  effect: Effect.Effect<Tool.NormalizedResult, Tool.Error>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const exit = await run(effect, signal)
  if (Exit.isFailure(exit)) throw refusal(name, exit.cause)
  return resultValue(exit.value)
}

function resultValue(result: Tool.NormalizedResult): unknown {
  if (result.output !== undefined) return result.output
  const text = result.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
  return text === '' ? null : text
}

type CodeModeSnapshot = NonNullable<Tool.Snapshot['codeMode']>

function qualifiedName(tool: Parameters<typeof ToolRuntime.effectiveName>[0]): string {
  const normalized = ToolRuntime.normalizedName(tool)
  const namespace = tool.options?.namespace
  return namespace === undefined ? normalized : `${namespace}.${normalized}`
}

function enclosingNamespaces(namespaces: CodeModeSnapshot['namespaces'], path: string): CodeNamespace[] {
  const segments = path.split('.')
  return segments.flatMap((_, index) => {
    const namespace = namespaces.get(segments.slice(0, index + 1).join('.'))
    return namespace === undefined ? [] : [{name: namespace.name, description: namespace.description}]
  })
}

function codeModeCapabilities(codeMode: CodeModeSnapshot, run: EffectRun): CodeCapability[] {
  return [...codeMode.tools].map(([name, tool]) => ({
    name,
    path: qualifiedName(tool),
    namespaces: enclosingNamespaces(codeMode.namespaces, qualifiedName(tool)),
    ...(tool.options?.pinned === true ? {pinned: true} : {}),
    description: tool.description,
    errors: [],
    inputSchema: jsonSchemaOnly(ToolRuntime.definition(tool).inputSchema),
    outputSchema: pluginOutput(ToolRuntime.definition(tool).outputSchema),
    execute: (input, request) =>
      runTool(name, run, codeMode.execute(name, input, toolContext(request)), request.signal),
  }))
}

function pluginOutput(schema: ReturnType<typeof ToolRuntime.definition>['outputSchema']): SchemaInput {
  return schema === undefined ? PLUGIN_TEXT_OUTPUT : {...schema}
}

function directCapabilities(snapshot: Tool.Snapshot, run: EffectRun): CodeCapability[] {
  return snapshot.definitions.map((definition) => ({
    name: definition.name,
    path: definition.name,
    description: definition.description,
    direct: true,
    errors: [],
    inputSchema: jsonSchemaOnly(definition.inputSchema),
    execute: (input, request) =>
      runTool(definition.name, run, snapshot.execute(directCall(definition.name, input, request)), request.signal),
  }))
}

export function toolDomainCapabilities(
  capabilities: readonly CodeCapability[],
  snapshot: Tool.Snapshot,
  run: EffectRun,
  collided: (name: string) => void,
): CodeCapability[] {
  const codeMode = snapshot.codeMode
  const offered = codeMode === undefined ? [] : capabilities
  const taken = (capability: CodeCapability) => offered.some((entry) => entry.name === capability.name)
  const added = [
    ...(codeMode === undefined ? [] : codeModeCapabilities(codeMode, run)),
    ...directCapabilities(snapshot, run),
  ]
  added.filter(taken).forEach((capability) => collided(capability.name))
  return [...offered, ...added.filter((capability) => !taken(capability))]
}

function directCall(name: string, input: unknown, request: ToolRequest): Parameters<Tool.Snapshot['execute']>[0] {
  const context = toolContext(request)
  return {
    sessionId: context.sessionId,
    agent: context.agent,
    messageId: context.messageId,
    call: {type: 'tool-call', id: context.id, name, input},
    ...(context.cancel === undefined ? {} : {cancel: context.cancel}),
  }
}

function readDeclaredCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  if (!('code' in error) || typeof error.code !== 'string' || error.code === '') return null
  return error.code
}

function withDeclaredCode(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const code = readDeclaredCode(error)
  if (code === null || message.startsWith(`${code}: `)) return error instanceof Error ? error : new Error(message)
  const bare = message.startsWith(`${code}:`) ? message.slice(code.length + 1).trimStart() : message
  return new Error(`${code}: ${bare}`)
}

type CatalogNode = {
  tool?: CodeModeCatalog.Tool
  namespace?: CodeNamespace
  readonly children: Map<string, CatalogNode>
}

function getNode(root: CatalogNode, path: string): CatalogNode {
  return path.split('.').reduce((parent, name) => {
    const child: CatalogNode = parent.children.get(name) ?? {children: new Map()}
    parent.children.set(name, child)
    return child
  }, root)
}

function renderCatalog(root: CatalogNode): ReadonlyArray<CodeModeCatalog.Tool | CodeModeCatalog.Namespace> {
  return Array.from(root.children)
    .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([name, node]) => {
      const tools = renderCatalog(node)
      const namespace =
        node.namespace === undefined && tools.length === 0
          ? undefined
          : {
              type: 'namespace' as const,
              name,
              ...(node.namespace?.description === undefined ? {} : {description: node.namespace.description}),
              tools,
            }
      if (node.tool === undefined) return namespace === undefined ? [] : [namespace]
      if (namespace === undefined) return [node.tool]
      return [node.tool, namespace]
    })
}

function catalogInventory(
  capabilities: readonly CodeCapability[],
  catalog: readonly CodeModeToolRuntime.ToolDescription[],
): CodeModeCatalog.Inventory {
  const pinned = new Set(capabilities.filter((capability) => capability.pinned === true).map(({path}) => path))
  const root: CatalogNode = {children: new Map()}
  for (const namespace of capabilities.flatMap((capability) => capability.namespaces ?? []))
    getNode(root, namespace.name).namespace = namespace
  for (const tool of catalog)
    getNode(root, tool.path).tool = {
      type: 'tool',
      name: tool.path.split('.').at(-1) ?? tool.path,
      description: tool.description,
      get signature() {
        return tool.signature
      },
      pinned: pinned.has(tool.path),
    }
  return {tools: renderCatalog(root)}
}

function visibleTool(capability: CodeCapability): CodeModeToolRuntime.VisibleTool {
  let schemas: ReturnType<typeof describeSchemas> | undefined
  const described = () => (schemas ??= describeSchemas(capability.inputSchema, capability.outputSchema))
  return {
    description: {
      path: capability.path,
      description: capability.description,
      get signature() {
        const {input, parameters, output} = described()
        const call = parameters.length === 0 ? '()' : `(${input})`
        return `${CodeMode.toolExpression(capability.path)}${call}: Promise<${output}>`
      },
    },
    get parameters() {
      return described().parameters
    },
    namespaces: capability.namespaces ?? [],
  }
}

type SandboxSearch = (input: unknown) => Promise<unknown>

function sandboxDiscovery(capabilities: readonly CodeCapability[]): {
  inventory: CodeModeCatalog.Inventory
  search: SandboxSearch
} {
  const searchIndex = CodeModeToolRuntime.prepare(capabilities.map(visibleTool))
  const searchTool = CodeModeToolRuntime.makeSearchTool(searchIndex)
  const decode = Schema.decodeUnknownEffect(searchTool.input)
  return {
    inventory: catalogInventory(
      capabilities,
      searchIndex.map((entry) => entry.description),
    ),
    search: (input) => Effect.runPromise(decode(input).pipe(Effect.flatMap(searchTool.execute))),
  }
}

export type ChatToolSet = {
  inventory: CodeModeCatalog.Inventory
  search: SandboxSearch
  codeMode: ChatTool[]
  asking: ChatTool[]
  asked: CodeCapability[]
  direct: ChatTool[]
  directed: CodeCapability[]
}

function chatTool(capability: CodeCapability, request: ToolRequest, lazy: boolean): ChatTool {
  return defineTool({
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema,
    outputSchema: z.unknown(),
    lazy,
  }).server(async (args, context) => {
    try {
      const toolCallId = context?.toolCallId
      const signal = context?.abortSignal
      const value = await capability.execute(args, {
        ...request,
        ...(toolCallId === undefined ? {} : {toolCallId}),
        ...(signal === undefined ? {} : {signal}),
      })
      return lazy ? value : cappedValue(value)
    } catch (error) {
      throw withDeclaredCode(error)
    }
  })
}

export function chatToolSet(capabilities: readonly CodeCapability[], request: ToolRequest): ChatToolSet {
  const asked = capabilities.filter((capability) => capability.approval === 'ask')
  const directed = capabilities.filter((capability) => capability.approval !== 'ask' && capability.direct === true)
  const sandboxed = capabilities.filter((capability) => capability.approval !== 'ask' && capability.direct !== true)
  return {
    ...sandboxDiscovery(sandboxed),
    codeMode: sandboxed.map((capability) => chatTool(capability, request, true)),
    asking: asked.map((capability) => chatTool(capability, request, false)),
    asked,
    direct: directed.map((capability) => chatTool(capability, request, false)),
    directed,
  }
}
