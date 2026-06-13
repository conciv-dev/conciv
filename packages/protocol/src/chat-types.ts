// Chat contracts. The streaming protocol is TanStack AI's own (AG-UI StreamChunk) — only the
// request/session envelopes below are ours.
import {z} from 'zod'
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
export type ChatSession = {
  sessionId: string | null
  source: 'agent' | 'chat' | 'new'
  cwd: string
  lock: {held: boolean; role: 'iterate' | 'chat' | null}
}
