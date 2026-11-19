import {z} from 'zod'
import {defineChatMiddleware, type ModelMessage, type ToolCall} from '@tanstack/ai'
import {isSandboxToolCall} from '@tanstack/ai-sandbox'
import {ChatEventType, toolTimeEvent} from '@conciv/protocol/chat-event-types'

type RecordedCall = {metadata: Record<string, unknown> | undefined; failed: boolean; startedAt?: number}

type Recorded = Map<string, RecordedCall>

const FailedResultSchema = z.union([
  z.looseObject({state: z.literal('output-error')}),
  z.looseObject({metadata: z.looseObject({tanstack: z.looseObject({state: z.literal('output-error')})})}),
])

const MetadataSchema = z.record(z.string(), z.unknown()).catch({})

export function toolHistory() {
  const recorded: Recorded = new Map()
  const restore = (ctx: {messages: ReadonlyArray<ModelMessage>}) => {
    ctx.messages = ctx.messages.map((message) => restored(message, recorded))
  }
  return defineChatMiddleware({
    name: 'conciv-tool-history',
    onChunk: (ctx, chunk) => {
      if (chunk.type === ChatEventType.TOOL_CALL_START) {
        const startedAt = Date.now()
        const metadata = {...MetadataSchema.parse(chunk.metadata), time: {start: startedAt}}
        recorded.set(chunk.toolCallId, {metadata, failed: false, startedAt})
        return [{...chunk, metadata}]
      }
      if (chunk.type === ChatEventType.TOOL_CALL_END) {
        restore(ctx)
        return
      }
      if (chunk.type !== ChatEventType.TOOL_CALL_RESULT) return
      const call = recorded.get(chunk.toolCallId)
      const end = Date.now()
      const time = call?.startedAt === undefined ? {end} : {start: call.startedAt, end}
      recorded.set(chunk.toolCallId, {
        metadata: {...call?.metadata, time},
        failed: FailedResultSchema.safeParse(chunk).success,
        startedAt: call?.startedAt,
      })
      restore(ctx)
      return [chunk, toolTimeEvent.create({toolCallId: chunk.toolCallId, time})]
    },
    onIteration: restore,
  })
}

function restored(message: ModelMessage, recorded: Recorded): ModelMessage {
  if (message.role === 'tool') return restoredResult(message, recorded)
  const calls = message.toolCalls ?? []
  const [first] = calls
  if (first === undefined) return message
  const toolCalls = calls.map((call) => withRecordedMetadata(call, recorded))
  if (!calls.every(isSandboxToolCall)) return {...message, toolCalls}
  return {...message, id: message.id ?? `${first.id}-call`, toolCalls}
}

function restoredResult(message: ModelMessage, recorded: Recorded): ModelMessage {
  if (message.error !== undefined || message.toolCallId === undefined) return message
  if (recorded.get(message.toolCallId)?.failed !== true || typeof message.content !== 'string') return message
  return {...message, error: message.content}
}

function withRecordedMetadata(call: ToolCall, recorded: Recorded): ToolCall {
  const metadata = recorded.get(call.id)?.metadata
  if (metadata === undefined) return call
  return {...call, metadata: {...MetadataSchema.parse(call.metadata), ...metadata}}
}
