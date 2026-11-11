import {z} from 'zod'
import {defineChatMiddleware, type ModelMessage, type ToolCall} from '@tanstack/ai'
import {isSandboxToolCall} from '@tanstack/ai-sandbox'
import {ChatEventType} from '@conciv/protocol/chat-event-types'

type RecordedCall = {metadata: Record<string, unknown> | undefined; failed: boolean}

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
        recorded.set(chunk.toolCallId, {metadata: chunk.metadata, failed: false})
        return
      }
      if (chunk.type === ChatEventType.TOOL_CALL_RESULT) {
        const call = recorded.get(chunk.toolCallId)
        recorded.set(chunk.toolCallId, {
          metadata: call?.metadata,
          failed: FailedResultSchema.safeParse(chunk).success,
        })
      }
      if (chunk.type === ChatEventType.TOOL_CALL_END || chunk.type === ChatEventType.TOOL_CALL_RESULT) restore(ctx)
    },
    onIteration: restore,
  })
}

function restored(message: ModelMessage, recorded: Recorded): ModelMessage {
  if (message.role === 'tool') return restoredResult(message, recorded)
  const calls = message.toolCalls ?? []
  const [first] = calls
  if (first === undefined || !calls.every(isSandboxToolCall)) return message
  return {
    ...message,
    id: message.id ?? `${first.id}-call`,
    toolCalls: calls.map((call) => withStartMetadata(call, recorded)),
  }
}

function restoredResult(message: ModelMessage, recorded: Recorded): ModelMessage {
  if (message.error !== undefined || message.toolCallId === undefined) return message
  if (recorded.get(message.toolCallId)?.failed !== true || typeof message.content !== 'string') return message
  return {...message, error: message.content}
}

function withStartMetadata(call: ToolCall, recorded: Recorded): ToolCall {
  const metadata = recorded.get(call.id)?.metadata
  if (metadata === undefined) return call
  return {...call, metadata: {...metadata, ...MetadataSchema.parse(call.metadata)}}
}
