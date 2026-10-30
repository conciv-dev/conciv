import {z} from 'zod'
import {defineTool, type ChatTool} from '@conciv/ai'
import type {ToolRequest} from '@conciv/extension'
import {type SandboxTool} from '@conciv/extension/registry'
import type {ConcivServerTool} from '@conciv/tools'

export const RESULT_CAP_CHARS = 50_000

const TRUNCATION_HEAD_CHARS = 4_000

const TRUNCATION_MARKER = 'conciv:truncated'

const TRUNCATION_ADVICE = 'narrow the request or aggregate inside the sandbox and return less data'

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

type StringifyAttempt = {body: string} | {failure: string}

function attemptStringify(value: unknown): StringifyAttempt {
  try {
    return {body: JSON.stringify(value) ?? 'null'}
  } catch (error) {
    return {failure: String(error)}
  }
}

function serializationFailure(reason: string): Record<string, unknown> {
  return {error: 'value could not be serialized', reason}
}

export function safeStringify(value: unknown): string {
  const attempt = attemptStringify(value)
  if ('body' in attempt) return attempt.body
  return JSON.stringify(serializationFailure(attempt.failure))
}

function wellFormedSlice(text: string, length: number): string {
  const sliced = text.slice(0, length)
  const last = sliced.charCodeAt(sliced.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) return sliced.slice(0, -1)
  return sliced
}

function truncationPayload(reason: string, headSource: string): Record<string, unknown> {
  return {
    [TRUNCATION_MARKER]: true,
    truncated: true,
    reason,
    advice: TRUNCATION_ADVICE,
    head: wellFormedSlice(headSource, TRUNCATION_HEAD_CHARS),
  }
}

export function truncationEnvelope(reason: string, headSource: string): string {
  return JSON.stringify(truncationPayload(reason, headSource))
}

function oversizeReason(length: number): string {
  return `the serialized result is ${length} characters and the cap is ${RESULT_CAP_CHARS}`
}

export function cappedText(body: string): string {
  if (body.length <= RESULT_CAP_CHARS) return body
  return truncationEnvelope(oversizeReason(body.length), body)
}

export function cappedValue(value: unknown): unknown {
  const attempt = attemptStringify(value)
  if ('failure' in attempt) return serializationFailure(attempt.failure)
  if (attempt.body.length <= RESULT_CAP_CHARS) return value
  return truncationPayload(oversizeReason(attempt.body.length), attempt.body)
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
      const value = await capability.execute(args, toolCallId === undefined ? request : {...request, toolCallId})
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
