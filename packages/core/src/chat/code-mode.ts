import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {
  createCodeMode,
  generateTypeStubs,
  toolsToBindings,
  type IsolateDriver,
  type ToolBinding,
} from '@tanstack/ai-code-mode'
import {toolDefinition, type AnyTool, type ServerTool} from '@tanstack/ai'
import {sanitizeIdentifier, uniqueIdentifier, type ToolRequest} from '@conciv/extension'
import type {CodeCapability} from './capabilities.js'
import type {ToolRunContext} from './runtime.js'
import {approvalRefusal, noListenerRefusal, requiresApproval, type PermissionGate} from './gate.js'
import {CODE_MODE_TOOL_CALL_EVENT, CODE_MODE_TOOL_ERROR_EVENT, CODE_MODE_TOOL_RESULT_EVENT} from './code-mode-parts.js'
import {logError} from '../lib/debug.js'
import {cappedValue} from '../lib/result-cap.js'
import type {SessionId} from '@conciv/protocol/chat-types'

const CODE_MODE_TIMEOUT_MS = 150_000

const CAPABILITY_BINDING_PREFIX = 'external_'

const CATALOG_TOOL_NAME = 'catalog'

export const CATALOG_CALL_HINT = 'await external_catalog({})'

const CATEGORY_SAMPLE_LIMIT = 6

const QUICKJS_MEMORY_LIMIT_MB = 256

const QUICKJS_MAX_STACK_BYTES = 2 * 1024 * 1024

export type DriverCandidate = {name: string; create: () => Promise<IsolateDriver | null>}

export const driverCandidates: readonly DriverCandidate[] = [
  {
    name: '@tanstack/ai-isolate-node',
    create: async () => {
      const loaded = await import('@tanstack/ai-isolate-node')
      if (!loaded.probeIsolatedVm().compatible) return null
      return loaded.createNodeIsolateDriver({timeout: CODE_MODE_TIMEOUT_MS})
    },
  },
  {
    name: '@tanstack/ai-isolate-quickjs',
    create: async () => {
      const loaded = await import('@tanstack/ai-isolate-quickjs')
      return loaded.createQuickJSIsolateDriver({
        timeout: CODE_MODE_TIMEOUT_MS,
        memoryLimit: QUICKJS_MEMORY_LIMIT_MB,
        maxStackSize: QUICKJS_MAX_STACK_BYTES,
      })
    },
  },
]

let driverLoad: Promise<IsolateDriver | null> | null = null

type DriverAttempt = {driver: IsolateDriver} | {reason: string}

async function attemptDriver(candidate: DriverCandidate): Promise<DriverAttempt> {
  const created = await candidate.create().catch((error: unknown) => ({reason: String(error)}))
  if (created === null) return {reason: 'the platform probe reported it incompatible'}
  if ('reason' in created) return created
  return {driver: created}
}

export async function firstUsableDriver(candidates: readonly DriverCandidate[]): Promise<IsolateDriver | null> {
  for (const candidate of candidates) {
    const attempt = await attemptDriver(candidate)
    if ('reason' in attempt) {
      logError(`[core] the code mode driver ${candidate.name} is unusable: ${attempt.reason}`)
      continue
    }
    logError(`[core] code mode is running on ${candidate.name}`)
    return attempt.driver
  }
  logError('[core] code mode found no usable isolate driver')
  return null
}

function loadDriver(): Promise<IsolateDriver | null> {
  driverLoad ??= firstUsableDriver(driverCandidates)
  return driverLoad
}

function declaredCodeOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  if (!('code' in error) || typeof error.code !== 'string' || error.code === '') return null
  return error.code
}

function encodeDeclaredError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const code = declaredCodeOf(error)
  if (code === null) return error instanceof Error ? error : new Error(message)
  if (message.startsWith(`${code}: `)) return error instanceof Error ? error : new Error(message)
  const bare = message.startsWith(`${code}:`) ? message.slice(code.length + 1).trimStart() : message
  return new Error(`${code}: ${bare}`)
}

export type SessionListening = (sessionId: SessionId) => boolean

async function emittingToolCall(
  name: string,
  args: unknown,
  context: ToolRunContext | undefined,
  execute: (callId: string) => Promise<unknown>,
): Promise<unknown> {
  const callId = randomUUID()
  const emit = context?.emitCustomEvent ?? (() => {})
  emit(CODE_MODE_TOOL_CALL_EVENT, {callId, name, input: args})
  try {
    const result = await execute(callId)
    emit(CODE_MODE_TOOL_RESULT_EVENT, {callId, result: cappedValue(result, `the ${name} result`)})
    return result
  } catch (error) {
    const encoded = encodeDeclaredError(error)
    emit(CODE_MODE_TOOL_ERROR_EVENT, {callId, error: encoded.message})
    throw encoded
  }
}

export function gatedToolRun(
  capability: CodeCapability,
  sessionId: SessionId,
  request: ToolRequest,
  gate: PermissionGate,
  listening: SessionListening,
): (args: unknown, context?: ToolRunContext) => Promise<unknown> {
  return (args, context) =>
    emittingToolCall(capability.name, args, context, async (callId) => {
      if (requiresApproval(capability)) {
        if (!listening(sessionId)) throw new Error(noListenerRefusal(capability.name, sessionId))
        const decision = await gate.decide(capability.name, args, callId)
        const refusal = approvalRefusal(capability.name, decision)
        if (refusal !== null) throw new Error(refusal)
      }
      return capability.execute(args, {...request, toolCallId: callId})
    })
}

export type NamedCapability = {capability: CodeCapability; bindingName: string}

export function withBindingNames(capabilities: CodeCapability[]): NamedCapability[] {
  const taken = new Set<string>()
  return capabilities.map((capability) => {
    const bindingName = uniqueIdentifier(sanitizeIdentifier(capability.name), taken)
    taken.add(bindingName)
    return {capability, bindingName}
  })
}

type BoundCapability = NamedCapability & {binding: ToolBinding}

function bindCapabilities(
  capabilities: CodeCapability[],
  sessionId: SessionId,
  request: ToolRequest,
  gate: PermissionGate,
  listening: SessionListening,
): BoundCapability[] {
  const named = withBindingNames(capabilities)
  const record = toolsToBindings(
    named.map((entry) =>
      toolDefinition({
        name: entry.bindingName,
        description: entry.capability.description,
        inputSchema: entry.capability.inputSchema,
        outputSchema: z.unknown(),
        lazy: true,
      }).server(gatedToolRun(entry.capability, sessionId, request, gate, listening)),
    ),
    CAPABILITY_BINDING_PREFIX,
  )
  const bindings = Object.values(record)
  return named.map((entry, index) => {
    const binding = bindings[index]
    if (binding === undefined) throw new Error('the built bindings drifted from the capability list')
    return {...entry, binding}
  })
}

const JsonRecordSchema = z.record(z.string(), z.unknown())

function jsonRecord(value: unknown, where: string): Record<string, unknown> {
  const parsed = JsonRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error(`${where}: the schema did not serialize to an object`)
  return parsed.data
}

const CatalogQuerySchema = z.object({
  search: z.string().optional(),
  name: z.string().optional(),
})

function catalogList(bound: BoundCapability[], search: string | undefined): unknown {
  const term = search?.toLowerCase() ?? ''
  const entries = bound.filter(({capability, bindingName}) => {
    if (term === '') return true
    const haystack =
      `${capability.name} ${bindingName} ${capability.description} ${capability.category} ${capability.keywords.join(' ')}`.toLowerCase()
    return haystack.includes(term)
  })
  return {
    tools: entries.map(({capability, binding}) => ({
      call: binding.name,
      name: capability.name,
      summary: capability.summary,
      category: capability.category,
      ...(capability.approval === undefined ? {} : {approval: capability.approval}),
      mutating: capability.mutating,
      reachable: capability.reachable,
    })),
  }
}

function capabilityDetail(bound: BoundCapability[], name: string): unknown {
  const found = bound.find(
    ({capability, bindingName, binding}) => capability.name === name || bindingName === name || binding.name === name,
  )
  if (!found) throw new Error(`unknown capability "${name}"; call catalog({}) to list what exists`)
  const signature = found.capability.signature()
  const output = signature.output === undefined ? undefined : jsonRecord(signature.output, `${name} output`)
  return {
    call: found.binding.name,
    name: found.capability.name,
    description: found.capability.description,
    category: found.capability.category,
    ...(found.capability.approval === undefined ? {} : {approval: found.capability.approval}),
    mutating: found.capability.mutating,
    reachable: found.capability.reachable,
    input: signature.input,
    output: signature.output,
    errors: signature.errors,
    typeStub: generateTypeStubs({
      [found.binding.name]: {
        name: found.binding.name,
        description: found.capability.description,
        inputSchema: jsonRecord(signature.input, `${name} input`),
        outputSchema: output,
        execute: async () => undefined,
      },
    }),
  }
}

function catalogTool(current: () => BoundCapability[]): ServerTool<typeof CatalogQuerySchema, z.ZodUnknown> {
  return toolDefinition({
    name: CATALOG_TOOL_NAME,
    description:
      'List and inspect every capability in this sandbox: catalog({}) or catalog({search}) lists entries with the exact function name to call, catalog({name}) returns one full typed signature.',
    inputSchema: CatalogQuerySchema,
    outputSchema: z.unknown(),
  }).server((args, context: ToolRunContext | undefined) =>
    emittingToolCall(CATALOG_TOOL_NAME, args, context, async () => {
      const query = CatalogQuerySchema.parse(args ?? {})
      const bound = current()
      if (query.name !== undefined) return capabilityDetail(bound, query.name)
      return catalogList(bound, query.search)
    }),
  )
}

function rankedCategories(capabilities: CodeCapability[]): string[] {
  const counts = new Map<string, number>()
  for (const capability of capabilities) {
    counts.set(capability.category, (counts.get(capability.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .toSorted(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName))
    .slice(0, CATEGORY_SAMPLE_LIMIT)
    .map(([name]) => name)
}

const CATALOG_PROMPT = `### Capability catalog

Inside execute_typescript, \`${CATALOG_CALL_HINT}\` lists every available capability with the exact function name to call, \`await external_catalog({search})\` filters that list, and \`await external_catalog({name})\` returns one full typed signature. Discover through the catalog instead of guessing a signature.`

function cappedTool(tool: AnyTool): AnyTool {
  const execute = tool.execute
  if (!execute) return tool
  return {
    ...tool,
    execute: async (args: unknown, context?: ToolRunContext) =>
      cappedValue(await execute(args, context), `the ${tool.name} result`),
  }
}

export type CodeMode = {
  tool: AnyTool
  tools: AnyTool[]
  systemPrompt: string
  categories: string[]
  run: (typescriptCode: string, context?: ToolRunContext) => Promise<unknown>
}

export async function makeCodeMode(
  capabilities: () => CodeCapability[],
  sessionId: SessionId,
  request: ToolRequest,
  gate: PermissionGate,
  options: {listening: SessionListening; timeoutMs?: number},
): Promise<CodeMode | null> {
  const snapshot = capabilities()
  if (snapshot.length === 0) return null
  const driver = await loadDriver()
  if (driver === null) return null
  const listening = options.listening
  const codeMode = createCodeMode({
    driver,
    tools: [catalogTool(() => bindCapabilities(capabilities(), sessionId, request, gate, listening))],
    timeout: options.timeoutMs ?? CODE_MODE_TIMEOUT_MS,
    onSecretParameter: 'throw',
    getSnippetBindings: async () => {
      const bound = bindCapabilities(capabilities(), sessionId, request, gate, listening)
      return Object.fromEntries(bound.map((entry) => [entry.binding.name, entry.binding]))
    },
  })
  const tool: AnyTool = codeMode.tool
  return {
    tool,
    tools: codeMode.tools.map(cappedTool),
    systemPrompt: [codeMode.systemPrompt, CATALOG_PROMPT].join('\n\n'),
    categories: rankedCategories(snapshot),
    run: (typescriptCode, context) => {
      const execute = tool.execute
      if (!execute) throw new Error('the code mode tool has no execute')
      return Promise.resolve(execute({typescriptCode}, context))
    },
  }
}
