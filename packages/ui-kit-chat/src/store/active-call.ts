import {keyBy} from 'es-toolkit'
import type {ChatPart, ToolCallPart, ToolResultPart, ChatMessage} from '@conciv/ai/messages'
import {coalesceTurns} from './grouping.js'
import {toolStatus} from '../tools/primitives/tool-status.js'

export function activeCallInParts(
  parts: ReadonlyArray<ChatPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
): ToolCallPart | null {
  const calls = parts.filter((part): part is ToolCallPart => part.type === 'tool-call' && part.id.length > 0)
  return calls.findLast((call) => toolStatus(call, resultFor(call.id)) === 'running') ?? null
}

function resultsByCallId(messages: ReadonlyArray<ChatMessage>): Record<string, ToolResultPart> {
  const results = messages
    .flatMap((message) => message.parts)
    .filter((part): part is ToolResultPart => part.type === 'tool-result' && part.toolCallId.length > 0)
  return keyBy(results, (part) => part.toolCallId)
}

export function activeToolCall(messages: ReadonlyArray<ChatMessage>): ToolCallPart | null {
  const turn = coalesceTurns(messages).at(-1)
  if (!turn || turn.role !== 'assistant') return null
  const results = resultsByCallId(messages)
  return activeCallInParts(turn.parts, (toolCallId) => results[toolCallId])
}
