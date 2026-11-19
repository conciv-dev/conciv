import {z} from 'zod'
import {defineChatMiddleware, generateMessageId, type ModelMessage} from '@tanstack/ai'
import {
  ChatEventType,
  codeModeCallEvent,
  codeModeErrorEvent,
  codeModeResultEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {CODE_MODE_EXTERNAL_PREFIX} from '@conciv/protocol/chat-types'

type ShapeResult = (value: unknown) => unknown

const LIBRARY_CHILD_EVENT = new RegExp(`^code_mode:${CODE_MODE_EXTERNAL_PREFIX}(call|result|error)$`)

const EXECUTE_TOOL_SUFFIX = 'execute_typescript'

const ChildMarkSchema = z.looseObject({parentToolCallId: z.string()})

const WireMarksSchema = z.looseObject({
  tanstack: z.looseObject({toolCallMetadata: z.record(z.string(), z.unknown())}),
})

function markedChild(metadata: unknown): boolean {
  return ChildMarkSchema.safeParse(metadata).success
}

function childCallIds(message: ModelMessage): string[] {
  const wire = WireMarksSchema.safeParse(message.metadata)
  const wireIds = wire.success
    ? Object.entries(wire.data.tanstack.toolCallMetadata).flatMap(([id, mark]) => (markedChild(mark) ? [id] : []))
    : []
  return [...(message.toolCalls ?? []).filter((call) => markedChild(call.metadata)).map((call) => call.id), ...wireIds]
}

function hasContent(message: ModelMessage): boolean {
  return message.content !== null && message.content.length > 0
}

export function withoutChildCalls(messages: ModelMessage[]): ModelMessage[] {
  const children = messages.flatMap(childCallIds)
  if (children.length === 0) return messages
  return messages.flatMap((message) => {
    if (message.role === 'tool')
      return message.toolCallId !== undefined && children.includes(message.toolCallId) ? [] : [message]
    const toolCalls = (message.toolCalls ?? []).filter((call) => !children.includes(call.id))
    if (toolCalls.length === (message.toolCalls ?? []).length) return [message]
    const {toolCalls: _dropped, ...rest} = message
    if (toolCalls.length > 0) return [{...rest, toolCalls}]
    return hasContent(message) ? [rest] : []
  })
}

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
