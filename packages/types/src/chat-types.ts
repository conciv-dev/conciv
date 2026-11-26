import {z} from 'zod'
import {type ChatMessage} from './chat-message-types.js'
import {UsageSnapshotSchema} from './usage-types.js'
import {WS_RPC_PAYLOAD_BUDGET_BYTES} from './rpc-types.js'
import {INIT_HARNESS_IDS} from './harness-types.js'

export const CONCIV_SESSION_HEADER = 'conciv-session-id'

export const CHAT_HISTORY_PAGE_SIZE = 50

export const CONCIV_CLAUDE_SESSION_HEADER = 'conciv-claude-session-id'

export const CONCIV_ORIGIN_HEADER = 'conciv-origin'

export const CONCIV_CLIENT_HEADER = 'conciv-client'

export const CONCIV_NAMED_TAB_HEADER = 'conciv-named-tab'

export const DraftItemSchema = z.object({key: z.string(), value: z.json()})

export type DraftItem = z.infer<typeof DraftItemSchema>

export const HubAccessSchema = z.enum(['open', 'project'])

export type HubAccess = z.infer<typeof HubAccessSchema>

export const CODE_MODE_EXTERNAL_PREFIX = 'external_'

export const CODE_MODE_TIMEOUT_MS = 150_000

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
  .regex(/^ses_[A-Za-z0-9_-]{1,128}$/)
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

export const HarnessListCursorSchema = z.object({updatedAt: z.number(), id: z.union([HarnessSessionId, SessionId])})

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

export const PermissionRuleSchema = z.object({
  action: z.string(),
  resource: z.string(),
  effect: z.enum(['allow', 'ask', 'deny']),
})
export type PermissionRule = z.infer<typeof PermissionRuleSchema>

const SessionMetadataSchema = z.record(z.string(), z.json())
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>

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
  transcriptCwd: z.string().nullable().default(null),
  attachedPid: z.number().nullable().default(null),
  attachedAt: z.number().nullable().default(null),
  deletedAt: z.number().nullable().default(null),
  permissions: z.array(PermissionRuleSchema).nullable().default(null),
  metadata: SessionMetadataSchema.nullable().default(null),
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

export const PermissionReplySchema = z.enum(['once', 'always', 'reject'])
export type PermissionReply = z.infer<typeof PermissionReplySchema>

export const PermissionDecisionSchema = z.object({
  approvalId: z.string(),
  reply: PermissionReplySchema,
})
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>

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
  imageInput: z.union([z.literal('native'), z.literal('fileRef'), z.literal(false)]),
  persistentPty: z.boolean(),
})
export type HarnessMeta = z.infer<typeof HarnessMetaSchema>
export const HarnessLoginStatusSchema = z.discriminatedUnion('loggedIn', [
  z.object({loggedIn: z.literal(true)}),
  z.object({loggedIn: z.literal(false), message: z.string()}),
])
export type HarnessLoginStatus = z.infer<typeof HarnessLoginStatusSchema>
export const ChatModelsSchema = z.object({
  models: z.array(HarnessModelSchema),
  defaultModel: z.string().nullable(),
  modelsFailed: z.boolean(),
  harness: HarnessMetaSchema,
  login: HarnessLoginStatusSchema,
})
const HubAgentSchema = z.object({harnessId: z.enum(INIT_HARNESS_IDS), name: z.string()})
export const HubAgentsSchema = z.object({installs: z.array(HubAgentSchema), connections: z.array(HubAgentSchema)})
export type HubAgents = z.infer<typeof HubAgentsSchema>
export const HarnessMenuEntrySchema = HarnessMetaSchema.extend({
  models: z.array(HarnessModelSchema),
  defaultModel: z.string().nullable(),
  modelsFailed: z.boolean(),
  login: HarnessLoginStatusSchema,
})
export type HarnessMenuEntry = z.infer<typeof HarnessMenuEntrySchema>
export const ChatHarnessesSchema = z.object({
  harnesses: z.array(HarnessMenuEntrySchema),
  defaultHarness: z.string(),
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
})
export const ChatToolsSchema = z.object({tools: z.array(ChatToolSchema)})
export type ChatTool = z.infer<typeof ChatToolSchema>

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
export type ChatSessionMeta = z.infer<typeof ChatSessionMetaSchema>
