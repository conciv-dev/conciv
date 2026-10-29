import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'

export const PUSH_WS_PATH = '/push-ws'
export const PUSH_SESSION_PARAM = 'sessionId'

const StreamChunkSchema = z.custom<StreamChunk>((value) => typeof value === 'object' && value !== null)

export const PageQueryFrameSchema = z.object({
  channel: z.literal('page'),
  requestId: z.string().min(1),
  query: z.unknown(),
})

export const ChatEventFrameSchema = z.object({channel: z.literal('chat'), chunk: StreamChunkSchema})

export const ReadyFrameSchema = z.object({channel: z.literal('ready')})

export const PushFrameSchema = z.discriminatedUnion('channel', [
  ReadyFrameSchema,
  PageQueryFrameSchema,
  ChatEventFrameSchema,
])

export type ReadyFrame = z.infer<typeof ReadyFrameSchema>
export type PageQueryFrame = z.infer<typeof PageQueryFrameSchema>
export type ChatEventFrame = z.infer<typeof ChatEventFrameSchema>
export type PushFrame = z.infer<typeof PushFrameSchema>
