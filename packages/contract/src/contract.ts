import {eventIterator, oc} from '@orpc/contract'
import {z} from 'zod'
import {type ChatEvent, RunLifecycleSchema} from '@conciv/protocol/chat-event-types'
import {
  ChatCommandsSchema,
  ChatHarnessesSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatToolsSchema,
  NativeSessionRefSchema,
  NavigationWriteSchema,
  PermissionDecisionSchema,
  ReasoningEffortSchema,
  SessionId,
} from '@conciv/protocol/chat-types'
import {UiAnswerValueSchema} from '@conciv/protocol/ui-types'
import {HarnessListCursorSchema} from '@conciv/protocol/harness-types'
import {
  OpenSourceResultSchema,
  OpenSourceSchema,
  PageChangeEntrySchema,
  PageReplySchema,
  SourceLocSchema,
  SymbolicateSchema,
} from '@conciv/protocol/page-types'
import {BundlerConfigSchema, ModuleNodeSchema} from '@conciv/protocol/bundler-types'
import {SessionCapturesSchema} from '@conciv/protocol/element-capture-types'
import {TOOL_ICON_KEYS} from '@conciv/protocol/tool-icon-types'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from './rows.js'

const StreamChunkSchema = z.custom<ChatEvent>((value) => typeof value === 'object' && value !== null)

const SessionIdInput = z.object({sessionId: SessionId})
const SessionListInput = z.object({
  includeHidden: z.boolean().optional(),
  cursor: HarnessListCursorSchema.nullish(),
  limit: z.number().int().min(1).max(100).default(30),
})
const SessionSearchInput = SessionListInput.extend({term: z.string().trim().min(1).max(200)})
const SessionPageSchema = z.object({sessions: z.array(SessionMetaSchema), next: HarnessListCursorSchema.nullable()})

const SessionsChangeSchema = z.object({version: z.number().int().nonnegative()})

export type SessionsChange = z.infer<typeof SessionsChangeSchema>
const ChatPendingInterruptSchema = z.object({
  id: z.string(),
  reason: z.string(),
  message: z.string().optional(),
  toolCallId: z.string().optional(),
})
const ChatPendingApprovalSchema = z.object({
  approvalId: z.string(),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  runId: z.string().nullable(),
})
export type ChatPendingApproval = z.infer<typeof ChatPendingApprovalSchema>
export const ChatHydrationSchema = z.object({
  messages: ChatHistorySchema,
  messageHarness: z.record(z.string(), z.string()),
  activeRun: z.object({runId: z.string()}).nullable(),
  lastRun: RunLifecycleSchema.nullable(),
  pendingApprovals: z.array(ChatPendingApprovalSchema),
  interrupts: z.object({runId: z.string(), pending: z.array(ChatPendingInterruptSchema)}).nullable(),
})
export type ChatHydration = z.infer<typeof ChatHydrationSchema>
const Ok = z.object({ok: z.literal(true)})
const NavigationWriteResult = z.object({ok: z.literal(true), applied: z.boolean()})
const notFound = {NOT_FOUND: {message: 'session not found'}}
const noBundler = {NO_BUNDLER: {message: 'no bundler bridge'}}
const approvalDenied = {APPROVAL_DENIED: {message: 'the call was not approved'}}
const registryCallErrors = {
  NO_PAGE_CLIENT: {message: 'no widget connected'},
  PAGE_TIMEOUT: {message: 'page did not reply (no widget connected?)'},
  UNKNOWN_TOOL: {message: 'no registered tool answers to that name'},
  INVALID_ARGS: {message: 'the tool rejected the arguments'},
  HANDLER_ERROR: {message: 'the tool failed to run'},
  APPROVAL_DENIED: {message: 'the call was not approved'},
}

export type RegistryCallErrorName = keyof typeof registryCallErrors

export const ToolCommandSignatureSchema = z.object({
  name: z.string(),
  path: z.array(z.string()),
  binding: z.enum(['server', 'client']),
  summary: z.string(),
  category: z.string().optional(),
  hint: z.string().optional(),
  positional: z.string().optional(),
  icon: z.enum(TOOL_ICON_KEYS).optional().catch(undefined),
  label: z
    .object({running: z.string().min(1), done: z.string().min(1)})
    .optional()
    .catch(undefined),
  mutating: z.boolean(),
  mirrors: z.boolean(),
  reachable: z.boolean(),
  approval: z.literal('ask').optional(),
  inputSchema: z.unknown(),
  outputSchema: z.unknown(),
  errors: z.array(z.object({code: z.string(), message: z.string(), transport: z.boolean()})).default([]),
})

export type ToolCommandSignature = z.infer<typeof ToolCommandSignatureSchema>

export const EditorOpenInputSchema = z.object({file: z.string(), line: z.number().int().min(1).optional()})

export const EngineStalenessSchema = z.object({
  stale: z.boolean(),
  changed: z.array(z.string()),
  tracked: z.array(z.string()),
  bootedAt: z.number(),
  fingerprint: z.string(),
})

export type EngineStaleness = z.infer<typeof EngineStalenessSchema>

export const LOGIN_CODE_PATTERN = /^\d{6}$/

export const ExchangeRefusalSchema = z.enum(['mismatch', 'expired'])

export type ExchangeRefusal = z.infer<typeof ExchangeRefusalSchema>

export const ExchangeResultSchema = z.union([
  z.object({token: z.string().min(1)}),
  z.object({refused: ExchangeRefusalSchema}),
])

export type ExchangeResult = z.infer<typeof ExchangeResultSchema>

export const ENGINE_TOKEN_MAX_LENGTH = 512

export const SOCKET_TRUST_FRAME = 'conciv:trust'

export const SocketTrustFrameSchema = z.object({
  type: z.literal(SOCKET_TRUST_FRAME),
  token: z.string().max(ENGINE_TOKEN_MAX_LENGTH),
})

export type SocketTrustFrame = z.infer<typeof SocketTrustFrameSchema>

export const contract = {
  auth: {
    trust: oc
      .input(z.object({token: z.string().max(ENGINE_TOKEN_MAX_LENGTH)}))
      .output(z.object({trusted: z.boolean()})),
    exchange: oc.input(z.object({code: z.string().regex(LOGIN_CODE_PATTERN)})).output(ExchangeResultSchema),
    requestCode: oc.input(z.object({reissue: z.boolean().optional()})).output(z.object({expiresAt: z.number()})),
  },
  sessions: {
    list: oc
      .input(SessionListInput.nullish().transform((input) => SessionListInput.parse(input ?? {})))
      .output(SessionPageSchema),
    search: oc.input(SessionSearchInput).output(SessionPageSchema),
    changes: oc.output(eventIterator(SessionsChangeSchema)),
    get: oc.errors(notFound).input(SessionIdInput).output(SessionMetaSchema),
    create: oc.output(SessionIdInput),
    resolve: oc.input(z.object({id: z.string().optional()})).output(SessionIdInput),
    open: oc.input(NativeSessionRefSchema).output(SessionIdInput),
    restore: oc.input(SessionIdInput).output(SessionIdInput),
    rename: oc
      .errors(notFound)
      .input(SessionIdInput.extend({title: z.string().min(1).max(120)}))
      .output(z.object({title: z.string()})),
    delete: oc.input(SessionIdInput).output(Ok),
    model: oc
      .errors({...notFound, UNKNOWN_MODEL: {message: 'unknown or disabled model'}})
      .input(SessionIdInput.extend({model: z.string()}))
      .output(z.object({model: z.string()})),
    effort: oc
      .errors({...notFound, UNSUPPORTED_EFFORT: {message: 'the session model does not support this effort'}})
      .input(SessionIdInput.extend({effort: ReasoningEffortSchema.nullable()}))
      .output(z.object({effort: ReasoningEffortSchema.nullable()})),
    compact: oc.input(SessionIdInput).output(Ok),
    switchHarness: oc
      .errors({
        ...notFound,
        UNKNOWN_HARNESS: {message: 'that harness is not available'},
        UNKNOWN_MODEL: {message: 'the target harness does not offer that model'},
        SESSION_RUNNING: {message: 'the session has a run in progress'},
      })
      .input(SessionIdInput.extend({harnessId: z.string().min(1), model: z.string().min(1).optional()}))
      .output(z.object({harnessId: z.string()})),
  },
  drafts: {
    get: oc.input(SessionIdInput).output(DraftRowSchema.nullable()),
    set: oc.input(DraftRowSchema.omit({updatedAt: true})).output(Ok),
  },
  markers: {
    list: oc.input(SessionIdInput).output(z.array(MarkerRowSchema)),
  },
  navigation: {
    get: oc.output(NavigationWriteSchema.nullable()),
    set: oc.input(NavigationWriteSchema).output(NavigationWriteResult),
  },
  chat: {
    events: oc.input(SessionIdInput).output(eventIterator(StreamChunkSchema)),
    hydrate: oc.input(SessionIdInput).output(ChatHydrationSchema),
    stop: oc.input(SessionIdInput.extend({runIds: z.array(z.string().min(1))})).output(Ok),
    permissionDecision: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending approval'}})
      .input(PermissionDecisionSchema)
      .output(Ok.extend({startsTurn: z.boolean()})),
    uiReply: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending ui question'}})
      .input(SessionIdInput.extend({toolCallId: z.string(), value: UiAnswerValueSchema}))
      .output(Ok),
  },
  registry: {
    catalog: oc.output(z.array(ToolCommandSignatureSchema)),
    call: oc
      .errors(registryCallErrors)
      .input(z.object({name: z.string().min(1), input: z.record(z.string(), z.unknown())}))
      .output(z.unknown()),
  },
  captures: {
    list: oc.input(SessionIdInput).output(SessionCapturesSchema),
  },
  page: {
    symbolicate: oc.input(SymbolicateSchema).output(SourceLocSchema.nullable()),
    changes: oc.output(z.array(PageChangeEntrySchema)),
    clearChanges: oc.output(Ok),
    queries: oc.output(eventIterator(z.object({requestId: z.string(), query: z.unknown()}))),
    reply: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending request'}})
      .input(PageReplySchema)
      .output(Ok),
  },
  server: {
    config: oc.errors(noBundler).output(BundlerConfigSchema),
    resolve: oc
      .errors(noBundler)
      .input(z.object({spec: z.string(), importer: z.string().optional()}))
      .output(z.object({id: z.string().nullable()})),
    graph: oc
      .errors(noBundler)
      .input(z.object({file: z.string()}))
      .output(z.array(ModuleNodeSchema)),
    transform: oc
      .errors(noBundler)
      .input(z.object({url: z.string()}))
      .output(z.object({code: z.string().nullable()})),
    urls: oc.errors(noBundler).output(z.object({local: z.array(z.string()), network: z.array(z.string())})),
    reload: oc
      .errors({...noBundler, ...approvalDenied})
      .input(z.object({file: z.string()}))
      .output(Ok),
    restart: oc
      .errors({...noBundler, ...approvalDenied})
      .input(z.object({force: z.boolean().default(false)}))
      .output(Ok),
  },
  editor: {
    open: oc.input(EditorOpenInputSchema).output(Ok),
    openFromFrames: oc.input(OpenSourceSchema).output(OpenSourceResultSchema),
  },
  meta: {
    models: oc.input(SessionIdInput).output(ChatModelsSchema),
    harnesses: oc.output(ChatHarnessesSchema),
    commands: oc.input(SessionIdInput).output(ChatCommandsSchema),
    tools: oc.output(ChatToolsSchema),
    engine: oc.output(EngineStalenessSchema),
  },
}
