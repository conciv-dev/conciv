import {
  ChatEventType,
  codeModeToolCallEvent,
  codeModeToolErrorEvent,
  codeModeToolResultEvent,
  type ChatEvent,
} from '@conciv/ai/events'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'

function callChunks(chunk: ChatEvent): ChatEvent[] | null {
  const value = codeModeToolCallEvent.parse(chunk)
  if (value === null) return null
  const {callId, name, input, toolCallId} = value
  return [
    {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId: callId,
      toolCallName: name,
      metadata: {
        [CODE_MODE_SYNTHETIC_PART_MARKER]: true,
        ...(toolCallId !== undefined ? {parentToolCallId: toolCallId} : {}),
      },
    },
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: callId, delta: JSON.stringify(input ?? {})},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: callId},
  ]
}

function resultChunks(chunk: ChatEvent): ChatEvent[] | null {
  const value = codeModeToolResultEvent.parse(chunk)
  if (value === null) return null
  return [
    {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: `${value.callId}-result`,
      toolCallId: value.callId,
      content: JSON.stringify(value.result ?? null),
    },
  ]
}

function errorChunks(chunk: ChatEvent): ChatEvent[] | null {
  const value = codeModeToolErrorEvent.parse(chunk)
  if (value === null) return null
  return [
    {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: `${value.callId}-result`,
      toolCallId: value.callId,
      content: JSON.stringify({error: value.error}),
      metadata: {tanstack: {state: 'output-error'}},
    },
  ]
}

export function codeModeToolChunks(chunk: ChatEvent): ChatEvent[] | null {
  return callChunks(chunk) ?? resultChunks(chunk) ?? errorChunks(chunk)
}

export function codeModeEventPublisher(
  parentToolCallId: string | undefined,
  publish: (chunks: ChatEvent[]) => void,
  unmapped?: (eventName: string, value: Record<string, unknown>) => void,
): (eventName: string, value: Record<string, unknown>) => void {
  return (eventName, value) => {
    const stamped = parentToolCallId === undefined ? value : {...value, toolCallId: parentToolCallId}
    const chunks = codeModeToolChunks({
      type: ChatEventType.CUSTOM,
      name: eventName,
      value: stamped,
      timestamp: Date.now(),
    })
    if (chunks === null) {
      unmapped?.(eventName, value)
      return
    }
    publish(chunks)
  }
}
