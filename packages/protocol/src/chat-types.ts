import {z} from 'zod'
import type {UIMessage} from '@tanstack/ai'
import {UsageSnapshotSchema} from './usage-types.js'
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

export const CONCIV_SESSION_HEADER = 'conciv-session-id'

export const ChatContentPartSchema = z
  .object({
    type: z.string(),
    content: z.string().optional(),
    source: z.object({type: z.string(), mimeType: z.string().optional(), value: z.string()}).loose().optional(),
  })
  .loose()

export const ChatMessageSchema = z
  .object({
    role: z.string(),
    content: z.union([z.string(), z.array(ChatContentPartSchema)]).optional(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).optional(),
  })
  .loose()

const TurnIntent = z.enum(['chat', 'compact'])
const MetaCarrier = z.object({model: z.string().optional(), intent: TurnIntent.optional()}).loose().optional()
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  model: z.string().optional(),

  intent: TurnIntent.optional(),
  forwardedProps: MetaCarrier,
  data: MetaCarrier,
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>

export const SessionId = z
  .string()
  .regex(/^conciv_[A-Za-z0-9_-]{1,128}$/)
  .brand<'ConcivSessionId'>()
export type SessionId = z.infer<typeof SessionId>

export function isSessionId(id: unknown): id is SessionId {
  return SessionId.safeParse(id).success
}

export const HarnessSessionId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

export const SessionRecordSchema = z.object({
  id: SessionId,
  harnessSessionId: z.string().nullable(),
  harnessKind: z.string(),
  origin: z.enum(['chat', 'agent', 'external']),
  title: z.string().nullable(),
  model: z.string().nullable(),
  usage: UsageSnapshotSchema.nullable(),
  cwd: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type SessionRecord = z.infer<typeof SessionRecordSchema>

export type SessionRecordInput = z.input<typeof SessionRecordSchema>

export const ResolveRequestSchema = z.object({id: z.string().optional()})
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>
export const ResolveResponseSchema = z.object({sessionId: SessionId})
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>
export const RenameResponseSchema = z.object({ok: z.boolean(), title: z.string()})
export type RenameResponse = z.infer<typeof RenameResponseSchema>
export const OkSchema = z.object({ok: z.boolean()})
export type Ok = z.infer<typeof OkSchema>

export const PermissionDecisionSchema = z.object({approvalId: z.string(), approved: z.boolean()})
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>

export const NavigationEntrySchema = z.object({href: z.string(), state: z.unknown().optional()})
export type NavigationEntry = z.infer<typeof NavigationEntrySchema>

export const NavigationStateSchema = z.object({
  entries: z.array(NavigationEntrySchema),
  index: z.number(),
})
export type NavigationState = z.infer<typeof NavigationStateSchema>

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

  harness: z.object({id: z.string(), name: z.string(), canLaunch: z.boolean()}),
})
export type HarnessModelInfo = z.infer<typeof HarnessModelSchema>
export type ChatModels = z.infer<typeof ChatModelsSchema>

export const ChatCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  argumentHint: z.string().optional(),
  source: z.enum(['harness', 'mcp', 'plugin']),
})
export const ChatCommandsSchema = z.object({commands: z.array(ChatCommandSchema)})
export type ChatCommand = z.infer<typeof ChatCommandSchema>
export type ChatCommands = z.infer<typeof ChatCommandsSchema>

export const ChatToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  extension: z.string().optional(),
})
export const ChatToolsSchema = z.object({tools: z.array(ChatToolSchema)})
export type ChatTool = z.infer<typeof ChatToolSchema>
export type ChatTools = z.infer<typeof ChatToolsSchema>

export const ChatHistorySchema = z.array(z.custom<UIMessage>((v) => v !== null && typeof v === 'object'))
export type ChatHistory = z.infer<typeof ChatHistorySchema>

export const ChatSessionMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messageCount: z.number(),
  running: z.boolean(),
  origin: z.enum(['conciv', 'external']),
  usage: UsageSnapshotSchema.nullable(),
})
export const ChatSessionsSchema = z.object({sessions: z.array(ChatSessionMetaSchema)})
export type ChatSessionMeta = z.infer<typeof ChatSessionMetaSchema>
export type ChatSessions = z.infer<typeof ChatSessionsSchema>

export const RenameSessionSchema = z.object({sessionId: SessionId, title: z.string().max(120)})
export type RenameSession = z.infer<typeof RenameSessionSchema>

export const ChatLaunchRequestSchema = z.object({model: z.string().optional()})
export type ChatLaunchRequest = z.infer<typeof ChatLaunchRequestSchema>

export const ChatLaunchSchema = z.object({
  supported: z.boolean(),
  opened: z.boolean(),
  command: z.string().nullable(),
})
export type ChatLaunch = z.infer<typeof ChatLaunchSchema>

export type RequestMeta = Record<string, unknown>
