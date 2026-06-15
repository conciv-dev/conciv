// Chat contracts. The streaming protocol is TanStack AI's own (AG-UI StreamChunk) — only the
// request/session envelopes below are ours.
import {z} from 'zod'
import type {UIMessage} from '@tanstack/ai'
import {UsageSnapshotSchema} from './usage-types.js'
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

// An inline content part on a posted message. Text carries `content`; image carries a base64
// data `source` (mimeType matches @tanstack/ai's ContentPartDataSource field name).
export const ChatContentPartSchema = z
  .object({
    type: z.string(),
    content: z.string().optional(),
    source: z.object({type: z.string(), mimeType: z.string().optional(), value: z.string()}).loose().optional(),
  })
  .loose()

// A posted message: parts-based UIMessage OR plain {role, content}. `content` is a string or an
// array of content parts (text + image). .loose tolerates drift.
export const ChatMessageSchema = z
  .object({
    role: z.string(),
    content: z.union([z.string(), z.array(ChatContentPartSchema)]).optional(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).optional(),
  })
  .loose()

// POST /api/chat body. The widget contributes the selected model via the connection body; TanStack
// AI serializes that onto the AG-UI RunAgentInput under `forwardedProps`/`data` (not top-level), so
// accept it in all three spots and let the route pick whichever is present.
// The widget contributes per-turn extras (model, intent) via the connection body; TanStack AI nests
// them under forwardedProps/data (not top-level), so accept them in all three spots.
const TurnIntent = z.enum(['chat', 'compact'])
const MetaCarrier = z.object({model: z.string().optional(), intent: TurnIntent.optional()}).loose().optional()
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  // 'compact' → the turn compacts the resumed context (native where the harness supports it, else a
  // summarize-prompt fallback).
  intent: TurnIntent.optional(),
  forwardedProps: MetaCarrier,
  data: MetaCarrier,
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>

// GET /api/chat/session response.
export const ChatSessionSchema = z.object({
  sessionId: z.string().nullable(),
  source: z.enum(['agent', 'chat', 'new']),
  cwd: z.string(),
  lock: z.object({held: z.boolean(), role: z.enum(['iterate', 'chat']).nullable()}),
  // Last persisted usage for this session, so the tracker fills on open before any turn.
  usage: UsageSnapshotSchema.nullish(),
})
export type ChatSession = z.infer<typeof ChatSessionSchema>

// GET /api/chat/models response — the active harness's models + the id to pre-select.
export const HarnessModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  group: z.string().optional(),
  disabled: z.boolean().optional(),
})
export const ChatModelsSchema = z.object({
  models: z.array(HarnessModelSchema),
  defaultModel: z.string().nullable(),
})
export type HarnessModelInfo = z.infer<typeof HarnessModelSchema>
export type ChatModels = z.infer<typeof ChatModelsSchema>

// GET /api/chat/history response — TanStack's UIMessage[] (too rich to re-validate field by
// field); validate array + object shape via z.custom, the sanctioned typed escape.
export const ChatHistorySchema = z.array(z.custom<UIMessage>((v) => v !== null && typeof v === 'object'))
export type ChatHistory = z.infer<typeof ChatHistorySchema>
