import {z} from 'zod'
import {toolErrors} from '@conciv/errors'
import type {SessionId} from './chat-types.js'

export type ToolRequest = {
  sessionId: SessionId
  agentId: string
  model: string | null
  toolCallId?: string
  origin: 'hub' | 'chat'
  signal?: AbortSignal
}

export const TOOL_NAME_RULE = /^[a-z][a-z0-9_]*$/

const ToolNameSchema = z.string().regex(TOOL_NAME_RULE)

export function assertToolName(name: string): void {
  if (ToolNameSchema.safeParse(name).success) return
  throw toolErrors.TOOL_NAME_INVALID({name, rule: TOOL_NAME_RULE.source})
}
