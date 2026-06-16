// Chat contracts. The streaming protocol is TanStack AI's own (AG-UI StreamChunk) — only the
// request/session envelopes below are ours.
import {z} from 'zod'
import type {UIMessage} from '@tanstack/ai'
import {UsageSnapshotSchema} from './usage-types.js'
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

// The HTTP header carrying our client-minted session id on every chat request.
export const AIDX_SESSION_HEADER = 'aidx-session-id'
// The session a request falls back to when it sends no header (the modal + the probe).
export const DEFAULT_SESSION_ID = 'default'

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
  sessionId: z.string(),
  // The harness resume token (display + resume), null until a turn mints one.
  harnessId: z.string().nullable(),
  // Human-readable session name from the transcript, or null when none is derivable yet.
  name: z.string().nullable(),
  source: z.enum(['agent', 'chat', 'new']),
  cwd: z.string(),
  lock: z.object({held: z.boolean(), role: z.enum(['iterate', 'chat']).nullable()}),
  // Last persisted usage for this session, so the tracker fills on open before any turn.
  usage: UsageSnapshotSchema.nullish(),
  // The active harness's identity + whether it supports "open in <harness>", so the widget can
  // label and gate the button before any click.
  harness: z.object({id: z.string(), name: z.string(), canLaunch: z.boolean()}),
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

// A client-minted session id (uuid) or a harness token. Charset-bounded so it can never escape the
// transcript dir when it reaches a filesystem path (defense-in-depth alongside withinProject).
export const SessionId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)

// One row in the session selector: the harness token + its joined live/persisted state.
export const ChatSessionMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messageCount: z.number(),
  running: z.boolean(),
  origin: z.enum(['aidx', 'external']),
  usage: UsageSnapshotSchema.nullable(),
})
export const ChatSessionsSchema = z.object({sessions: z.array(ChatSessionMetaSchema)})
export type ChatSessionMeta = z.infer<typeof ChatSessionMetaSchema>
export type ChatSessions = z.infer<typeof ChatSessionsSchema>

// POST /api/chat/sessions/title body.
export const RenameSessionSchema = z.object({sessionId: SessionId, title: z.string().max(120)})
export type RenameSession = z.infer<typeof RenameSessionSchema>

// POST /api/chat/launch body — the widget's current model, mirrored into the resumed terminal session.
export const ChatLaunchRequestSchema = z.object({model: z.string().optional()})
export type ChatLaunchRequest = z.infer<typeof ChatLaunchRequestSchema>

// POST /api/chat/launch response. `supported` false → the active harness defines no interactive
// launch. `opened` true → core launched the terminal; false → the widget copies `command` (the
// paste-able resume command, null only when unsupported).
export const ChatLaunchSchema = z.object({
  supported: z.boolean(),
  opened: z.boolean(),
  command: z.string().nullable(),
})
export type ChatLaunch = z.infer<typeof ChatLaunchSchema>
