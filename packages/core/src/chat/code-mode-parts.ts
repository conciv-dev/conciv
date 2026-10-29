import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'

export const CODE_MODE_TOOL_CALL_EVENT = 'conciv:tool_call'
export const CODE_MODE_TOOL_RESULT_EVENT = 'conciv:tool_result'
export const CODE_MODE_TOOL_ERROR_EVENT = 'conciv:tool_error'

const CallValueSchema = z.object({
  callId: z.string(),
  name: z.string(),
  input: z.unknown(),
  toolCallId: z.string().optional(),
})

const ResultValueSchema = z.object({callId: z.string(), result: z.unknown()})

const ErrorValueSchema = z.object({callId: z.string(), error: z.string()})

function callChunks(value: unknown): StreamChunk[] | null {
  const parsed = CallValueSchema.safeParse(value)
  if (!parsed.success) return null
  const {callId, name, input, toolCallId} = parsed.data
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: callId,
      toolCallName: name,
      toolName: name,
      metadata: {
        [CODE_MODE_SYNTHETIC_PART_MARKER]: true,
        ...(toolCallId !== undefined ? {parentToolCallId: toolCallId} : {}),
      },
    },
    {type: EventType.TOOL_CALL_ARGS, toolCallId: callId, delta: JSON.stringify(input ?? {})},
    {type: EventType.TOOL_CALL_END, toolCallId: callId},
  ]
}

function resultChunks(value: unknown): StreamChunk[] | null {
  const parsed = ResultValueSchema.safeParse(value)
  if (!parsed.success) return null
  return [
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: `${parsed.data.callId}-result`,
      toolCallId: parsed.data.callId,
      content: JSON.stringify(parsed.data.result ?? null),
      state: 'output-available',
    },
  ]
}

function errorChunks(value: unknown): StreamChunk[] | null {
  const parsed = ErrorValueSchema.safeParse(value)
  if (!parsed.success) return null
  return [
    {
      type: EventType.TOOL_CALL_RESULT,
      messageId: `${parsed.data.callId}-result`,
      toolCallId: parsed.data.callId,
      content: JSON.stringify({error: parsed.data.error}),
      state: 'output-error',
    },
  ]
}

export function codeModeToolChunks(chunk: StreamChunk): StreamChunk[] | null {
  if (chunk.type !== EventType.CUSTOM) return null
  if (chunk.name === CODE_MODE_TOOL_CALL_EVENT) return callChunks(chunk.value)
  if (chunk.name === CODE_MODE_TOOL_RESULT_EVENT) return resultChunks(chunk.value)
  if (chunk.name === CODE_MODE_TOOL_ERROR_EVENT) return errorChunks(chunk.value)
  return null
}

export function codeModeEventPublisher(
  parentToolCallId: string | undefined,
  publish: (chunks: StreamChunk[]) => void,
  unmapped?: (eventName: string, value: Record<string, unknown>) => void,
): (eventName: string, value: Record<string, unknown>) => void {
  return (eventName, value) => {
    const stamped = parentToolCallId === undefined ? value : {...value, toolCallId: parentToolCallId}
    const chunks = codeModeToolChunks({type: EventType.CUSTOM, name: eventName, value: stamped, timestamp: Date.now()})
    if (chunks === null) {
      unmapped?.(eventName, value)
      return
    }
    publish(chunks)
  }
}
