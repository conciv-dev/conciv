import {defineChatMiddleware} from '@tanstack/ai'
import type {MessageStore} from '@tanstack/ai-persistence'
import {z} from 'zod'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {CompactionMetadataSchema, type ModelMessage} from '@conciv/protocol/chat-message-types'

const COMPACTION: z.infer<typeof CompactionMetadataSchema> = {conciv: {compaction: true}}

const RunTagSchema = z.object({tanstack: z.object({run: z.object({id: z.string()})})})

const ConcivBagSchema = z.object({conciv: z.record(z.string(), z.unknown())})

export function compactionStamp(messages: MessageStore) {
  return defineChatMiddleware({
    name: 'conciv-compaction-stamp',
    onChunk: (_ctx, chunk) => {
      if (
        chunk.type !== ChatEventType.TEXT_MESSAGE_START &&
        chunk.type !== ChatEventType.REASONING_MESSAGE_START &&
        chunk.type !== ChatEventType.RUN_FINISHED
      ) {
        return undefined
      }
      return {...chunk, metadata: stamped(chunk.metadata)}
    },
    onFinish: async (ctx) => {
      const stored = await messages.loadThread(ctx.threadId)
      if (!stored.some((message) => ranIn(message, ctx.runId))) return
      await messages.saveThread(
        ctx.threadId,
        stored.map((message) =>
          ranIn(message, ctx.runId) ? {...message, metadata: stamped(message.metadata)} : message,
        ),
      )
    },
  })
}

function stamped(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const bag = ConcivBagSchema.safeParse(metadata)
  const conciv = bag.success ? bag.data.conciv : {}
  return {...metadata, conciv: {...conciv, ...COMPACTION.conciv}}
}

function ranIn(message: ModelMessage, runId: string): boolean {
  const tag = RunTagSchema.safeParse(message.metadata)
  return message.role === 'assistant' && tag.success && tag.data.tanstack.run.id === runId
}
