import {defineChatMiddleware, generateMessageId} from '@tanstack/ai'
import {
  ChatEventType,
  codeModeCallEvent,
  codeModeErrorEvent,
  codeModeResultEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'

type ShapeResult = (value: unknown) => unknown

const LIBRARY_CHILD_EVENT = /^code_mode:external_(call|result|error)$/

const EXECUTE_TOOL_SUFFIX = 'execute_typescript'

function serialized(value: unknown): string {
  return JSON.stringify(value) ?? 'null'
}

function childCallChunks(event: ChatEvent, parentToolCallId: string | null): ChatEvent[] | null {
  const call = codeModeCallEvent.parse(event)
  if (call === null) return null
  return [
    {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId: call.callId,
      toolCallName: call.function,
      ...(parentToolCallId === null ? {} : {metadata: {parentToolCallId}}),
    },
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: call.callId, delta: serialized(call.args ?? {})},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: call.callId},
  ]
}

function childResultChunks(event: ChatEvent, shapeResult: ShapeResult): ChatEvent[] | null {
  const settled = codeModeResultEvent.parse(event)
  if (settled === null) return null
  return [
    {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: generateMessageId(),
      toolCallId: settled.callId,
      content: serialized(shapeResult(settled.result ?? null)),
    },
  ]
}

function childErrorChunks(event: ChatEvent): ChatEvent[] | null {
  const failed = codeModeErrorEvent.parse(event)
  if (failed === null) return null
  return [
    {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: generateMessageId(),
      toolCallId: failed.callId,
      content: serialized({error: failed.error}),
      metadata: {tanstack: {state: 'output-error'}},
    },
  ]
}

export function childCardChunks(
  event: ChatEvent,
  parentToolCallId: string | null,
  shapeResult: ShapeResult,
): ChatEvent[] | null {
  if (event.type === ChatEventType.CUSTOM && LIBRARY_CHILD_EVENT.test(event.name)) return []
  return childCallChunks(event, parentToolCallId) ?? childResultChunks(event, shapeResult) ?? childErrorChunks(event)
}

export function childCards(shapeResult: ShapeResult) {
  const execution: {parent: string | null} = {parent: null}
  return defineChatMiddleware({
    name: 'conciv-child-cards',
    onChunk: (_ctx, chunk) => {
      if (chunk.type === ChatEventType.TOOL_CALL_START && chunk.toolCallName.endsWith(EXECUTE_TOOL_SUFFIX)) {
        execution.parent = chunk.toolCallId
      }
      return childCardChunks(chunk, execution.parent, shapeResult) ?? undefined
    },
  })
}
