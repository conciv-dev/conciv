// Chat contracts. The streaming protocol is TanStack AI's own (AG-UI StreamChunk) — only the
// request/session envelopes below are ours.
import {z} from 'zod'
import type {UIMessage} from '@tanstack/ai'
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

// A posted message: parts-based UIMessage OR plain {role, content}; .loose tolerates drift.
export const ChatMessageSchema = z
  .object({
    role: z.string(),
    content: z.string().optional(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).optional(),
  })
  .loose()

// POST /api/chat body.
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  sessionId: z.string().optional(),
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>

// GET /api/chat/session response.
export const ChatSessionSchema = z.object({
  sessionId: z.string().nullable(),
  source: z.enum(['agent', 'chat', 'new']),
  cwd: z.string(),
  lock: z.object({held: z.boolean(), role: z.enum(['iterate', 'chat']).nullable()}),
})
export type ChatSession = z.infer<typeof ChatSessionSchema>

// GET /api/chat/history response — TanStack's UIMessage[] (too rich to re-validate field by
// field); validate array + object shape via z.custom, the sanctioned typed escape.
export const ChatHistorySchema = z.array(z.custom<UIMessage>((v) => v !== null && typeof v === 'object'))
export type ChatHistory = z.infer<typeof ChatHistorySchema>
