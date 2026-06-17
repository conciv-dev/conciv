// Chat contracts. The streaming protocol is TanStack AI's own (AG-UI StreamChunk) — only the
// request/session envelopes below are ours.
import {z} from 'zod'
import type {UIMessage} from '@tanstack/ai'
import {UsageSnapshotSchema} from './usage-types.js'
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

// The HTTP header carrying our session id on every chat request.
export const AIDX_SESSION_HEADER = 'aidx-session-id'

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

// Our session id — minted by the server, aidx_ prefixed, branded so a raw harness id can't be
// passed where ours is required.
export const SessionId = z
  .string()
  .regex(/^aidx_[A-Za-z0-9_-]{1,128}$/)
  .brand<'AidxSessionId'>()
export type SessionId = z.infer<typeof SessionId>

// Runtime guard — narrows an unknown/raw string to our branded SessionId. The one place to decide
// "is this ours" so callers never hand-roll a `.startsWith('aidx_')` check.
export function isSessionId(id: unknown): id is SessionId {
  return SessionId.safeParse(id).success
}

// The harness's own session id (resume token). Charset-bounded for filesystem safety.
export const HarnessSessionId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

// One consolidated, durable record per session — the single source of truth.
export const SessionRecordSchema = z.object({
  id: SessionId,
  harnessSessionId: z.string().nullable(), // resume token; null = never run
  harnessKind: z.string(), // 'claude' | 'codex' ... routes resume
  origin: z.enum(['chat', 'agent', 'external']),
  title: z.string().nullable(),
  model: z.string().nullable(),
  usage: UsageSnapshotSchema.nullable(),
  cwd: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type SessionRecord = z.infer<typeof SessionRecordSchema>
// Raw shape accepted into the store (id is an unbranded string here; the schema brands it on parse).
export type SessionRecordInput = z.input<typeof SessionRecordSchema>

export const ResolveRequestSchema = z.object({id: z.string().optional()})
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>
export const ResolveResponseSchema = z.object({sessionId: SessionId})
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>
export const RenameResponseSchema = z.object({ok: z.boolean(), title: z.string()})
export type RenameResponse = z.infer<typeof RenameResponseSchema>
export const OkSchema = z.object({ok: z.boolean()})
export type Ok = z.infer<typeof OkSchema>

// The decision posted from the permission approval gate.
export const PermissionDecisionSchema = z.object({approvalId: z.string(), approved: z.boolean()})
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>

// GET /api/chat/session response.
export const ChatSessionSchema = z.object({
  sessionId: SessionId,
  // The harness resume token (display + resume), null until a turn mints one (= a "new" session).
  harnessSessionId: z.string().nullable(),
  // Human-readable session name from the transcript, or null when none is derivable yet.
  name: z.string().nullable(),
  // How this session came to exist; never the harness id.
  origin: z.enum(['chat', 'agent', 'external']),
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
  // The active harness's identity + whether it supports "open in <harness>". Lives on this
  // non-session route so the widget can gate/label the launch button before resolving a session.
  harness: z.object({id: z.string(), name: z.string(), canLaunch: z.boolean()}),
})
export type HarnessModelInfo = z.infer<typeof HarnessModelSchema>
export type ChatModels = z.infer<typeof ChatModelsSchema>

// GET /api/chat/history response — TanStack's UIMessage[] (too rich to re-validate field by
// field); validate array + object shape via z.custom, the sanctioned typed escape.
export const ChatHistorySchema = z.array(z.custom<UIMessage>((v) => v !== null && typeof v === 'object'))
export type ChatHistory = z.infer<typeof ChatHistorySchema>

// One row in the session selector: our id (or a raw harness id for an unwrapped external row) +
// its joined live/persisted state.
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
