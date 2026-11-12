import {z} from 'zod'
import {cappedValue} from '@conciv/contract'
import {defineTool, type ChatTool} from '@conciv/protocol/chat-tool-types'
import type {ToolRequest} from '@conciv/extension'
import {type SandboxTool} from '@conciv/extension/registry'
import type {ConcivServerTool} from '@conciv/tools'

export type CodeCapability = {
  name: string
  description: string
  approval?: 'ask'
  errors: {code: string; message: string}[]
  inputSchema: z.ZodObject<z.ZodRawShape>
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
