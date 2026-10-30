import {z} from 'zod'
import {defineChatMiddleware, generateMessageId} from '@tanstack/ai'
import {ChatEventType, defineChatEvent, type ChatEvent} from '../events/events.js'

type ShapeResult = (value: unknown) => unknown

const EXTERNAL_PREFIX = /^external_/

const EXECUTE_TOOL_SUFFIX = 'execute_typescript'

const childCallEvent = defineChatEvent(
  'code_mode:external_call',
  z.looseObject({
    callId: z.string().min(1),
    function: z.string(),
    args: z.unknown(),
    toolCallId: z.string().optional(),
  }),
)

const childResultEvent = defineChatEvent(
  'code_mode:external_result',
  z.looseObject({callId: z.string().min(1), result: z.unknown()}),
)

const childErrorEvent = defineChatEvent(
  'code_mode:external_error',
  z.looseObject({callId: z.string().min(1), error: z.string()}),
)

function serialized(value: unknown): string {
  return JSON.stringify(value) ?? 'null'
}

function childCallChunks(event: ChatEvent, parentToolCallId: string | null): ChatEvent[] | null {
  const call = childCallEvent.parse(event)
  if (call === null) return null
  const parent = call.toolCallId ?? parentToolCallId
  return [
    {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId: call.callId,
      toolCallName: call.function.replace(EXTERNAL_PREFIX, ''),
      ...(parent === null ? {} : {metadata: {parentToolCallId: parent}}),
    },
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: call.callId, delta: serialized(call.args ?? {})},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: call.callId},
  ]
}

function childResultChunks(event: ChatEvent, shapeResult: ShapeResult): ChatEvent[] | null {
  const settled = childResultEvent.parse(event)
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
  const failed = childErrorEvent.parse(event)
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
