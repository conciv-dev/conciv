import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {Effect, Schema} from 'effect'
import {cappedValue} from '@conciv/contract'
import {Agent, Session, Tool} from '@conciv/plugin-host'
import {defineTool, type ChatTool} from '@conciv/protocol/chat-tool-types'
import type {ToolRequest} from '@conciv/extension'
import {type SandboxTool} from '@conciv/extension/registry'
import type {ConcivServerTool} from '@conciv/tools'

type SchemaInput = NonNullable<Parameters<typeof defineTool>[0]['inputSchema']>

export type CodeCapability = {
  name: string
  description: string
  approval?: 'ask'
  errors: {code: string; message: string}[]
  inputSchema: SchemaInput
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
}

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
    description: discoverableDescription(tool),
    ...(tool.approval === undefined ? {} : {approval: tool.approval}),
    errors: tool.errors.map(({code, message}) => ({code, message})),
    inputSchema: tool.schema,
    execute: (input, request) => call(tool.name, input, request),
  }))
}

export function assistCapabilities(tools: ConcivServerTool[]): CodeCapability[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    errors: [],
    inputSchema: tool.inputSchema,
    execute: (input) => tool.execute(input),
  }))
}

type EffectRun = <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal | undefined) => Promise<A>

type CodeModeTools = NonNullable<Tool.Snapshot['codeMode']>['tools']

type ToolInput = CodeModeTools extends ReadonlyMap<string, infer Info extends {input: unknown}> ? Info['input'] : never

function capabilityInputSchema(input: ToolInput): SchemaInput {
  if (Schema.isSchema(input)) return Schema.toStandardJSONSchemaV1(input)
  return input
}

function cancelOf(signal: AbortSignal): Effect.Effect<void> {
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
    agent: Agent.Id.make(request.agentId),
    messageId: undefined,
    id: Tool.CallId.make(request.toolCallId ?? randomUUID()),
    progress: () => Effect.void,
    ...(request.signal === undefined ? {} : {cancel: cancelOf(request.signal)}),
  }
}

function resultValue(result: Tool.NormalizedResult): unknown {
  if (result.output !== undefined) return result.output
  const text = result.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
  return text === '' ? null : text
}

export function toolDomainCapabilities(
  capabilities: readonly CodeCapability[],
  snapshot: Tool.Snapshot,
  run: EffectRun,
  collided: (name: string) => void,
): CodeCapability[] {
  const codeMode = snapshot.codeMode
  if (codeMode === undefined) return [...capabilities]
  const tools = [...codeMode.tools]
  const taken = (name: string) => capabilities.some((capability) => capability.name === name)
  tools.filter(([name]) => taken(name)).forEach(([name]) => collided(name))
  return [
    ...capabilities,
    ...tools
      .filter(([name]) => !taken(name))
      .map(([name, tool]): CodeCapability => ({
        name,
        description: tool.description,
        errors: [],
        inputSchema: capabilityInputSchema(tool.input),
        execute: async (input, request) =>
          resultValue(await run(codeMode.execute(name, input, toolContext(request)), request.signal)),
      })),
  ]
}

function declaredCodeOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  if (!('code' in error) || typeof error.code !== 'string' || error.code === '') return null
  return error.code
}

function withDeclaredCode(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const code = declaredCodeOf(error)
  if (code === null || message.startsWith(`${code}: `)) return error instanceof Error ? error : new Error(message)
  const bare = message.startsWith(`${code}:`) ? message.slice(code.length + 1).trimStart() : message
  return new Error(`${code}: ${bare}`)
}

export type ChatToolSet = {codeMode: ChatTool[]; asking: ChatTool[]; asked: CodeCapability[]}

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
  const sandboxed = capabilities.filter((capability) => capability.approval !== 'ask')
  return {
    codeMode: sandboxed.map((capability) => chatTool(capability, request, true)),
    asking: asked.map((capability) => chatTool(capability, request, false)),
    asked,
  }
}
