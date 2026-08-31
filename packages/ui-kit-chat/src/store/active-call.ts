import {keyBy} from 'es-toolkit'
import type {MessagePart, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import {coalesceTurns} from './grouping.js'
import {toolStatus} from '../tools/primitives/tool-status.js'

export function activeCallInParts(
  parts: ReadonlyArray<MessagePart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
): ToolCallPart | null {
  const calls = parts.filter((part): part is ToolCallPart => part.type === 'tool-call' && part.id.length > 0)
  return calls.findLast((call) => toolStatus(call, resultFor(call.id)) === 'running') ?? null
}

function resultsByCallId(messages: ReadonlyArray<UIMessage>): Record<string, ToolResultPart> {
  const results = messages
    .flatMap((message) => message.parts)
    .filter((part): part is ToolResultPart => part.type === 'tool-result' && part.toolCallId.length > 0)
  return keyBy(results, (part) => part.toolCallId)
}

export function activeToolCall(messages: ReadonlyArray<UIMessage>): ToolCallPart | null {
  const turn = coalesceTurns(messages).at(-1)
  if (!turn || turn.role !== 'assistant') return null
  const results = resultsByCallId(messages)
  return activeCallInParts(turn.parts, (toolCallId) => results[toolCallId])
}
