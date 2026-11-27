import {z} from 'zod'
import {typesErrors} from './errors/errors.js'
import type {SessionId} from './chat-types.js'

export type ToolRequest = {
  sessionId: SessionId
  agentId: string
  model: string | null
  toolCallId?: string
  origin: 'hub' | 'chat'
  signal?: AbortSignal
}

export type ToolError = Error & {readonly isToolError: true; code: string; data?: unknown}

export function toolError(code: string, options: {message?: string; data?: unknown} = {}): ToolError {
  return Object.assign(new Error(options.message ?? code), {isToolError: true as const, code, data: options.data})
}

export function isToolError(value: unknown): value is ToolError {
  return value instanceof Error && Reflect.get(value, 'isToolError') === true
}

export const TOOL_NAME_RULE = /^[a-z][a-z0-9_]*$/

const ToolNameSchema = z.string().regex(TOOL_NAME_RULE)

export function assertToolName(name: string): void {
  if (ToolNameSchema.safeParse(name).success) return
  throw typesErrors.TOOL_NAME_INVALID({name, rule: TOOL_NAME_RULE.source})
}

export type RegistryCallGate = <Output>(run: () => Promise<Output>) => Promise<Output>
