import {z} from 'zod'
import type {ChatEvent} from './chat-event-types.js'

export const PUSH_WS_PATH = '/push-ws'
export const PUSH_SESSION_PARAM = 'sessionId'

const StreamChunkSchema = z.custom<ChatEvent>((value) => typeof value === 'object' && value !== null)

export const ChatEventFrameSchema = z.object({channel: z.literal('chat'), chunk: StreamChunkSchema})

export const ReadyFrameSchema = z.object({channel: z.literal('ready')})

export const PushFrameSchema = z.discriminatedUnion('channel', [ReadyFrameSchema, ChatEventFrameSchema])

export type ReadyFrame = z.infer<typeof ReadyFrameSchema>
export type ChatEventFrame = z.infer<typeof ChatEventFrameSchema>
export type PushFrame = z.infer<typeof PushFrameSchema>
