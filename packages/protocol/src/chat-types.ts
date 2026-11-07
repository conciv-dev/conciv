import {z} from 'zod'
import {type ChatMessage} from './chat-message-types.js'
import {UsageSnapshotSchema} from './usage-types.js'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from './rpc-types.js'
import {INIT_HARNESS_IDS} from './harness-types.js'

export const CONCIV_SESSION_HEADER = 'conciv-session-id'

export const CHAT_WS_PATH = '/chat-ws'
export const CHAT_SSE_PATH = '/chat-sse'

export const CHAT_DELIVERY_HEADERS = ['x-run-id', 'last-event-id'] as const

export const CONCIV_CLAUDE_SESSION_HEADER = 'conciv-claude-session-id'

export const CONCIV_ORIGIN_HEADER = 'conciv-origin'

export const CONCIV_CLIENT_HEADER = 'conciv-client'

export const OUTSIDE_SESSION_TARGET = 'outside-session'

export type HubAccess = 'open' | 'session' | 'project'

export const CODE_MODE_SYNTHETIC_PART_MARKER = 'codeModeSynthetic'

const MEBIBYTE = 1024 * 1024
export const MAX_ATTACHMENT_RAW_BYTES = Math.floor((WS_RPC_PAYLOAD_BUDGET_BYTES * 3) / 4 / MEBIBYTE) * MEBIBYTE
const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_RAW_BYTES / 3) * 4
const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64_ALPHABET.test(value)
}

const Base64Payload = z.string().min(1).max(MAX_ATTACHMENT_BASE64_LENGTH).refine(isBase64)

const PartMetadata = z.object({modelOnly: z.boolean().optional()}).loose().optional()

export const ChatContentPartSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('text'), content: z.string(), metadata: PartMetadata}).loose(),
  z
    .object({
      type: z.literal('image'),
      source: z
        .object({type: z.literal('data'), mimeType: z.string().regex(/^image\/[A-Za-z0-9.+-]+$/), value: Base64Payload})
        .loose(),
      metadata: PartMetadata,
    })
    .loose(),
  z
    .object({
      type: z.literal('document'),
      source: z
        .object({
          type: z.literal('data'),
          mimeType: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9.+-]+$/),
          value: Base64Payload,
        })
        .loose(),
      metadata: PartMetadata,
    })
    .loose(),
])
export type ChatContentPart = z.infer<typeof ChatContentPartSchema>

export const SessionId = z
  .string()
  .regex(/^conciv_[A-Za-z0-9_-]{1,128}$/)
  .brand<'ConcivSessionId'>()
export type SessionId = z.infer<typeof SessionId>

export function isSessionId(id: unknown): id is SessionId {
  return SessionId.safeParse(id).success
}

export const HarnessSessionId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .brand<'HarnessSessionId'>()
export type HarnessSessionId = z.infer<typeof HarnessSessionId>

export function isHarnessSessionId(id: unknown): id is HarnessSessionId {
  return HarnessSessionId.safeParse(id).success
}

export const NativeSessionRefSchema = z.object({
  harnessKind: z.string().min(1),
  cwd: z.string().min(1),
  nativeId: HarnessSessionId,
})
export type NativeSessionRef = z.infer<typeof NativeSessionRefSchema>

export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max'])
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>

export const SessionRecordSchema = z.object({
  id: SessionId,
  harnessSessionId: HarnessSessionId.nullable(),
  harnessKind: z.string(),
  origin: z.enum(['chat', 'agent', 'external']),
  title: z.string().nullable(),
  model: z.string().nullable(),
  effort: ReasoningEffortSchema.nullable().default(null),
  usage: UsageSnapshotSchema.nullable(),
  cwd: z.string(),
  deletedAt: z.number().nullable().default(null),
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

export const PermissionScopeSchema = z.enum(['once', 'session'])
export type PermissionScope = z.infer<typeof PermissionScopeSchema>

export const PermissionDecisionSchema = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
  scope: PermissionScopeSchema.default('once'),
})
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>

export const NavigationEntrySchema = z.object({href: z.string(), state: z.unknown().optional()})
export type NavigationEntry = z.infer<typeof NavigationEntrySchema>

export const NavigationStateSchema = z.object({
  entries: z.array(NavigationEntrySchema),
  index: z.number(),
})
export type NavigationState = z.infer<typeof NavigationStateSchema>

export const NavigationWriteSchema = NavigationStateSchema.extend({updatedAt: z.number().int()})
export type NavigationWrite = z.infer<typeof NavigationWriteSchema>

export const HarnessModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  group: z.string().optional(),
  disabled: z.boolean().optional(),
  efforts: z.array(ReasoningEffortSchema).optional(),
})
export const HarnessMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  canLaunch: z.boolean(),
  imageInput: z.union([z.literal('native'), z.literal('fileRef'), z.literal(false)]),
})
export type HarnessMeta = z.infer<typeof HarnessMetaSchema>
export const ChatModelsSchema = z.object({
  models: z.array(HarnessModelSchema),
  defaultModel: z.string().nullable(),
  harness: HarnessMetaSchema,
  hubInstalls: z.array(z.object({harnessId: z.enum(INIT_HARNESS_IDS), name: z.string()})),
})
export const HarnessMenuEntrySchema = HarnessMetaSchema.extend({
  models: z.array(HarnessModelSchema),
  defaultModel: z.string().nullable(),
  modelsFailed: z.boolean(),
})
export type HarnessMenuEntry = z.infer<typeof HarnessMenuEntrySchema>
export const ChatHarnessesSchema = z.object({
  harnesses: z.array(HarnessMenuEntrySchema),
  defaultHarness: z.string(),
})
export type ChatHarnesses = z.infer<typeof ChatHarnessesSchema>
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

export const ChatHistorySchema = z.array(z.custom<ChatMessage>((v) => v !== null && typeof v === 'object'))
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

export const TabsSchema = z.object({
  project: z.object({name: z.string().nullable(), root: z.string(), branch: z.string().nullable()}),
  tabs: z.array(
    z.object({
      sessionId: SessionId,
      harness: z.string(),
      browserTabs: z.number(),
      session: z.object({title: z.string(), updatedAt: z.number(), running: z.boolean()}),
      page: z.object({href: z.string(), title: z.string(), state: z.enum(['visible', 'hidden'])}).nullable(),
    }),
  ),
})
export type Tabs = z.infer<typeof TabsSchema>

export const TabOpenSchema = z.object({open: z.boolean(), instructions: z.string().nullable()})
export type TabOpen = z.infer<typeof TabOpenSchema>

export type RequestMeta = Record<string, unknown>
