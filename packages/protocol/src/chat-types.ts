// Chat contracts for the devgent chat agent. The streaming protocol + message model are
// TanStack AI's own types (AG-UI `StreamChunk`, `UIMessage`) — we do NOT invent a wire
// format: the backend emits TanStack `StreamChunk`s via `toServerSentEventsStream` and the
// widget consumes them with `fetchServerSentEvents` natively. Only the request/session
// envelopes below are ours.
import {z} from 'zod'
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

// One posted chat message. The transport may send either a parts-based UIMessage or a plain
// {role, content} model message, so both content and parts are optional; unknown extra keys
// pass through (.loose) to stay tolerant of transport drift.
export const ChatMessageSchema = z
  .object({
    role: z.string(),
    content: z.string().optional(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).optional(),
  })
  .loose()

// POST /api/chat body (what the widget's fetchServerSentEvents transport sends). The Zod schema
// is the contract — validated server-side via h3 readValidatedBody; the type is inferred.
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
