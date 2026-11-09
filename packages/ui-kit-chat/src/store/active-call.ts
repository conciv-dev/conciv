import {keyBy} from 'es-toolkit'
import type {ChatPart, ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {Turn} from './grouping.js'
import {toolStatus} from '../tools/primitives/tool-status.js'

export function activeCallInParts(
  parts: ReadonlyArray<ChatPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
): ToolCallPart | null {
  const calls = parts.filter((part): part is ToolCallPart => part.type === 'tool-call' && part.id.length > 0)
  return calls.findLast((call) => toolStatus(call, resultFor(call.id)) === 'running') ?? null
}

export function activeToolCall(turn: Turn | undefined): ToolCallPart | null {
  if (!turn || turn.role !== 'assistant') return null
  const results = keyBy(
    turn.parts.filter((part): part is ToolResultPart => part.type === 'tool-result' && part.toolCallId.length > 0),
    (part) => part.toolCallId,
  )
  return activeCallInParts(turn.parts, (toolCallId) => results[toolCallId])
}
