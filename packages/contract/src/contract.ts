import {eventIterator, oc, type Schema} from '@orpc/contract'
import type {AsyncIteratorClass} from '@orpc/client'
import {z} from 'zod'
import {type ChatEvent, RunLifecycleSchema} from '@conciv/protocol/chat-event-types'
import {
  ChatCommandsSchema,
  ChatContentPartSchema,
  ChatHarnessesSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  HubAgentsSchema,
  ChatToolsSchema,
  HarnessListCursorSchema,
  HarnessSessionId,
  NativeSessionRefSchema,
  PermissionDecisionSchema,
  PermissionRuleSchema,
  ReasoningEffortSchema,
  SessionId,
  TabOpenSchema,
  TabsSchema,
} from '@conciv/protocol/chat-types'
import {UiAnswerValueSchema} from '@conciv/protocol/ui-types'
import {PageQueueHandleSchema, PageQueueProgressSchema, PageQueueResultSchema} from '@conciv/protocol/page-types'
import {TOOL_ICON_KEYS} from '@conciv/protocol/tool-icon-types'
import {TtyServerControlSchema} from '@conciv/protocol/terminal-types'
import {INIT_HARNESS_IDS} from '@conciv/protocol/harness-types'
import {DraftRowSchema, MarkerRowSchema, SessionHitSchema, SessionMetaSchema} from './rows.js'

const StreamChunkSchema = z.custom<ChatEvent>((value) => typeof value === 'object' && value !== null)

interface ChatEventStream extends Schema<
  AsyncIteratorObject<ChatEvent, unknown, void>,
  AsyncIteratorClass<ChatEvent, unknown, void>
> {}
const ChatEventStreamSchema: ChatEventStream = eventIterator(StreamChunkSchema)

const SessionIdInput = z.object({sessionId: SessionId})
const RunIdSchema = z.string().min(1)
const ChatSendInput = SessionIdInput.extend({
  runId: RunIdSchema,
  messages: z.array(z.looseObject({id: z.string().min(1), role: z.string()})),
})
const ChatJoinInput = z.object({runId: RunIdSchema, lastEventId: z.string().min(1).optional()})
const SessionListInput = z.object({
  includeHidden: z.boolean().optional(),
  cursor: HarnessListCursorSchema.nullish(),
  limit: z.number().int().min(1).max(100).default(30),
})
const SessionSearchInput = SessionListInput.extend({
  term: z.string().trim().min(1).max(200),
  everywhere: z.boolean().default(false).catch(false),
})
const SessionPageSchema = z.object({sessions: z.array(SessionMetaSchema), next: HarnessListCursorSchema.nullable()})
const SessionSearchPageSchema = z.object({
  sessions: z.array(SessionHitSchema),
  next: HarnessListCursorSchema.nullable(),
})

const SessionPreviewPage = z.object({
  before: z.string().min(1).nullable(),
  limit: z.number().int().min(1).max(100),
})
const SessionPreviewInput = z.union([
  SessionPreviewPage.extend({
    harness: z.string().min(1),
    nativeId: HarnessSessionId,
    cwd: z.string().min(1).optional(),
  }),
  SessionPreviewPage.extend({sessionId: SessionId}),
])
const SessionPreviewSchema = z.object({messages: ChatHistorySchema, earlier: z.string().min(1).nullable()})

const SessionsChangeSchema = z.object({version: z.number().int().nonnegative()})

export type SessionsChange = z.infer<typeof SessionsChangeSchema>

const SettingsScopeSchema = z.enum(['global', 'project'])

export type SettingsScope = z.infer<typeof SettingsScopeSchema>

export const SettingsNamespaceSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((namespace) => !namespace.includes('\0'), 'a settings namespace cannot contain a NUL character')
  .refine(
    (namespace) => !/[/\\:?]/.test(namespace),
    'a settings namespace is one file name inside the settings folder, without / \\ : or ?',
  )

const SettingsSnapshotSchema = z.object({
  generation: z.string().min(1),
  version: z.number().int().nonnegative(),
  value: z.record(z.string(), z.unknown()),
})

export type SettingsSnapshot = z.infer<typeof SettingsSnapshotSchema>

const SettingsInput = z.object({scope: SettingsScopeSchema, namespace: SettingsNamespaceSchema})
const SettingsKeyInput = SettingsInput.extend({key: z.string().max(512)})
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
  permission: z.object({always: z.boolean()}).optional(),
})
export type ChatPendingApproval = z.infer<typeof ChatPendingApprovalSchema>
const ChatHistoryWindowSchema = z.object({
  limit: z.number().int().positive().optional(),
  before: z.string().min(1).optional(),
})
export type ChatHistoryWindow = z.infer<typeof ChatHistoryWindowSchema>
const ChatHistoryPageSchema = z.discriminatedUnion('truncated', [
  z.object({truncated: z.literal(false)}),
  z.object({truncated: z.literal(true), cursor: z.string()}),
])
export const ChatHydrationSchema = z.object({
  messages: ChatHistorySchema,
  messageHarness: z.record(z.string(), z.string()),
  activeRun: z.object({runId: z.string()}).nullable(),
  lastRun: RunLifecycleSchema.nullable(),
  pendingApprovals: z.array(ChatPendingApprovalSchema),
  interrupts: z.object({runId: z.string(), pending: z.array(ChatPendingInterruptSchema)}).nullable(),
  page: ChatHistoryPageSchema.optional(),
})
export type ChatHydration = z.infer<typeof ChatHydrationSchema>
const Ok = z.object({ok: z.literal(true)})

const notFound = {NOT_FOUND: {message: 'session not found'}}
const approvalDenied = {APPROVAL_DENIED: {message: 'the call was not approved'}}
const HubHarnessInput = z.object({harness: z.enum(INIT_HARNESS_IDS)})
const HubOutcome = z
  .object({ok: z.literal(true), note: z.string().optional()})
  .or(z.object({ok: z.literal(false), message: z.string()}))
const registryCallErrors = {
  NO_PAGE_CLIENT: {message: 'no widget connected'},
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
  reachable: z.boolean(),
  approval: z.literal('ask').optional(),
  inputSchema: z.unknown(),
  outputSchema: z.unknown(),
  errors: z.array(z.object({code: z.string(), message: z.string()})).default([]),
})

export type ToolCommandSignature = z.infer<typeof ToolCommandSignatureSchema>

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

const CodeSessionInput = z.object({sessionId: SessionId.optional()})

const CodeDelivery = {
  logs: z.array(z.string()),
  files: z.array(ChatContentPartSchema).optional(),
  queued: z.array(PageQueueHandleSchema),
  finished: z.array(PageQueueResultSchema),
}

export const CodeExecuteResultSchema = z.discriminatedUnion('ok', [
  z.object({ok: z.literal(true), result: z.unknown(), ...CodeDelivery}),
  z.object({
    ok: z.literal(false),
    error: z.object({message: z.string(), name: z.string().optional(), code: z.string().optional()}),
    ...CodeDelivery,
  }),
])

export type CodeExecuteResult = z.infer<typeof CodeExecuteResultSchema>

export const CodeDiscoverResultSchema = z.object({tools: z.unknown(), finished: z.array(PageQueueResultSchema)})

export type CodeDiscoverResult = z.infer<typeof CodeDiscoverResultSchema>

export const CodeDescriptionsSchema = z.object({execute: z.string(), discover: z.string().nullable()})

export type CodeDescriptions = z.infer<typeof CodeDescriptionsSchema>

const noCodeMode = {NO_CODE_MODE: {message: 'code mode is unavailable on this engine'}}

const noQueue = {NO_QUEUE: {message: 'no such queue on this tab'}}

const pluginRpcFailed = {
  PLUGIN_RPC: {
    status: 400,
    message: 'the plugin rpc call failed',
    data: z.object({type: z.string(), message: z.string(), data: z.unknown().optional()}),
  },
  PLUGIN_RPC_INTERNAL: {
    status: 500,
    message: 'the plugin rpc call failed inside the plugin',
    data: z.object({
      type: z.enum(['rpc.internal', 'rpc.invalid_output']),
      message: z.string(),
      data: z.unknown().optional(),
    }),
  },
}

const LocationPublicRefSchema = z.object({directory: z.string()})

function locationResponse<Data extends z.ZodType>(data: Data) {
  return z.object({location: LocationPublicRefSchema, data})
}

export const EventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  created: z.number().optional(),
  durable: z.object({aggregateID: z.string(), seq: z.number(), version: z.number()}).optional(),
  data: z.record(z.string(), z.unknown()),
  location: LocationPublicRefSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const pluginNotFound = {
  PLUGIN_NOT_FOUND: {
    status: 404,
    message: 'no active plugin with a ./plugin-experimental bundle',
    data: z.object({pluginId: z.string(), message: z.string()}),
  },
}

const pluginChunkNotFound = {
  PLUGIN_CHUNK_NOT_FOUND: {
    status: 404,
    message: "no such chunk in the plugin's current build",
    data: z.object({pluginId: z.string(), file: z.string()}),
  },
}

const PluginIdSchema = z.string().min(1).max(256)

const PluginSourceSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('builtin')}),
  z.object({
    type: z.literal('package'),
    target: z.string(),
    version: z.string().optional(),
    outdated: z.literal(true).optional(),
    updating: z.literal(true).optional(),
  }),
  z.object({type: z.literal('local'), path: z.string()}),
  z.object({type: z.literal('sdk')}),
])

const PluginFeaturesSchema = z.object({
  server: z.literal(true).optional(),
  rpc: z.literal(true).optional(),
  experimental: z.literal(true).optional(),
})

const PluginStateSchema = z.discriminatedUnion('status', [
  z.object({status: z.literal('active')}),
  z.object({status: z.literal('failed'), error: z.string(), ref: z.string().optional()}),
])

const PluginInfoSchema = z.object({
  id: z.string().optional(),
  source: PluginSourceSchema,
  features: PluginFeaturesSchema,
  state: PluginStateSchema,
})

const SkillInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  autoinvoke: z.boolean().optional(),
  path: z.string(),
  content: z.string(),
})

const FileSystemEntrySchema = z.object({path: z.string(), type: z.enum(['file', 'directory'])})

const FileSystemFindInputSchema = z.object({
  query: z.string(),
  type: z.enum(['file', 'directory']).optional(),
  limit: z.number().int().positive().optional(),
})

const AgentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.object({id: z.string(), providerId: z.string(), variant: z.string().optional()}).optional(),
  request: z.object({
    settings: z.record(z.string(), z.unknown()),
    headers: z.record(z.string(), z.string()),
    body: z.record(z.string(), z.unknown()),
  }),
  system: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(['subagent', 'primary', 'all']),
  hidden: z.boolean(),
  color: z.string().optional(),
  steps: z.number().int().positive().optional(),
  permissions: z.array(PermissionRuleSchema).readonly(),
})

const PluginChunkFileSchema = z
  .string()
  .max(256)
  .regex(/^[\w.-]+\.cjs$/)

const PluginChunkSchema = z.object({file: PluginChunkFileSchema, code: z.string()})

export const PluginExperimentalBundleSchema = z.object({
  file: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^/\\]+\.c?js$/),
  code: z.string(),
  revision: z.string().min(1).max(256),
  options: z.record(z.string(), z.json()),
  chunks: z.array(PluginChunkSchema),
})

export const PluginExperimentalChunksSchema = z.object({
  revision: z.string().min(1).max(256),
  chunks: z.array(PluginChunkSchema).min(1),
})

const PtyIdSchema = z.string().regex(/^pty_[0-9a-f-]{36}$/)
const PtySizeSchema = z.object({cols: z.number().int().min(2).max(500), rows: z.number().int().min(2).max(500)})
const PersistentPtyInfoSchema = z.object({
  id: PtyIdSchema,
  sessionId: SessionId,
  size: PtySizeSchema,
  busy: z.boolean(),
})
const PtyIdInput = z.object({ptyId: PtyIdSchema})
const PtyCursorSchema = z.number().int().nonnegative()
const PtyOutputItemSchema = z.union([
  z.object({type: z.literal('output'), data: z.string()}),
  z.object({type: z.literal('meta'), cursor: PtyCursorSchema}),
  TtyServerControlSchema,
])
const PTY_WRITE_MAX = 1024 * 1024
const ptyNotFound = {
  PTY_NOT_FOUND: {status: 404, message: 'no terminal with that id', data: z.object({ptyId: z.string()})},
}
const slowConsumer = {
  SLOW_CONSUMER: {
    message: 'the reader fell too far behind the terminal output',
    data: z.object({capacity: z.number()}),
  },
}
const noTty = {NO_TTY: {message: "the session's harness has no terminal command"}}
const ptyBusy = {BUSY: {message: 'the terminal CLI is busy'}}

export const contract = {
  auth: {
    trust: oc
      .input(z.object({token: z.string().max(ENGINE_TOKEN_MAX_LENGTH)}))
      .output(z.object({trusted: z.boolean()})),
    exchange: oc.input(z.object({code: z.string().regex(LOGIN_CODE_PATTERN)})).output(ExchangeResultSchema),
    requestCode: oc.input(z.object({reissue: z.boolean().optional()})).output(z.object({expiresAt: z.number()})),
    issueCode: oc
      .errors({FORBIDDEN: {message: 'only the engine token may issue a login code'}})
      .output(z.object({code: z.string().regex(LOGIN_CODE_PATTERN), expiresAt: z.number()})),
  },
  sessions: {
    list: oc
      .input(SessionListInput.nullish().transform((input) => SessionListInput.parse(input ?? {})))
      .output(SessionPageSchema),
    search: oc.input(SessionSearchInput).output(SessionSearchPageSchema),
    changes: oc.output(eventIterator(SessionsChangeSchema)),
    get: oc
      .errors({...notFound, ...approvalDenied})
      .input(SessionIdInput)
      .output(SessionMetaSchema),
    preview: oc.errors(notFound).input(SessionPreviewInput).output(SessionPreviewSchema),
    create: oc.output(SessionIdInput.extend({session: SessionMetaSchema})),
    resolve: oc
      .errors(notFound)
      .input(z.object({id: z.string().optional()}))
      .output(SessionIdInput),
    open: oc.errors(notFound).input(NativeSessionRefSchema).output(SessionIdInput),
    restore: oc.errors(approvalDenied).input(SessionIdInput).output(SessionIdInput),
    rename: oc
      .errors({...notFound, ...approvalDenied})
      .input(SessionIdInput.extend({title: z.string().min(1).max(120)}))
      .output(z.object({title: z.string()})),
    delete: oc.errors(approvalDenied).input(SessionIdInput).output(Ok),
    model: oc
      .errors({...notFound, ...approvalDenied, UNKNOWN_MODEL: {message: 'unknown or disabled model'}})
      .input(SessionIdInput.extend({model: z.string()}))
      .output(z.object({model: z.string()})),
    effort: oc
      .errors({
        ...notFound,
        ...approvalDenied,
        UNSUPPORTED_EFFORT: {message: 'the session model does not support this effort'},
      })
      .input(SessionIdInput.extend({effort: ReasoningEffortSchema.nullable()}))
      .output(z.object({effort: ReasoningEffortSchema.nullable()})),
    compact: oc
      .errors({...notFound, ...approvalDenied})
      .input(SessionIdInput)
      .output(Ok),
    switchHarness: oc
      .errors({
        ...notFound,
        ...approvalDenied,
        UNKNOWN_HARNESS: {message: 'that harness is not available'},
        UNKNOWN_MODEL: {message: 'the target harness does not offer that model'},
        SESSION_RUNNING: {message: 'the session has a run in progress'},
      })
      .input(SessionIdInput.extend({harnessId: z.string().min(1), model: z.string().min(1).optional()}))
      .output(z.object({harnessId: z.string()})),
  },
  settings: {
    all: oc.input(SettingsInput).output(SettingsSnapshotSchema),
    set: oc.input(SettingsKeyInput.extend({value: z.unknown()})).output(SettingsSnapshotSchema),
    delete: oc.input(SettingsKeyInput).output(SettingsSnapshotSchema),
    changes: oc.input(SettingsInput).output(eventIterator(SettingsSnapshotSchema)),
  },
  drafts: {
    get: oc.errors(approvalDenied).input(SessionIdInput).output(DraftRowSchema.nullable()),
    set: oc.errors(approvalDenied).input(DraftRowSchema).output(Ok),
  },
  markers: {
    list: oc.errors(approvalDenied).input(SessionIdInput).output(z.array(MarkerRowSchema)),
  },
  chat: {
    events: oc.errors(approvalDenied).input(SessionIdInput).output(ChatEventStreamSchema),
    send: oc.errors(approvalDenied).input(ChatSendInput).output(ChatEventStreamSchema),
    join: oc.errors(approvalDenied).input(ChatJoinInput).output(ChatEventStreamSchema),
    hydrate: oc
      .errors(approvalDenied)
      .input(SessionIdInput.extend(ChatHistoryWindowSchema.shape))
      .output(ChatHydrationSchema),
    stop: oc
      .errors(approvalDenied)
      .input(SessionIdInput.extend({runIds: z.array(z.string().min(1))}))
      .output(Ok),
    permissionDecision: oc
      .errors({...approvalDenied, UNKNOWN_REQUEST: {message: 'no pending approval'}})
      .input(PermissionDecisionSchema)
      .output(Ok),
    uiReply: oc
      .errors({...approvalDenied, UNKNOWN_REQUEST: {message: 'no pending ui question'}})
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
  tabs: {
    list: oc.output(TabsSchema),
    get: oc.input(SessionIdInput).output(TabOpenSchema),
  },
  code: {
    describe: oc.errors({...noCodeMode, ...approvalDenied}).output(CodeDescriptionsSchema),
    execute: oc
      .errors({...noCodeMode, ...approvalDenied, ...notFound})
      .input(CodeSessionInput.extend({typescriptCode: z.string()}))
      .output(CodeExecuteResultSchema),
    discover: oc
      .errors({...noCodeMode, ...approvalDenied, ...notFound})
      .input(CodeSessionInput.extend({toolNames: z.array(z.string())}))
      .output(CodeDiscoverResultSchema),
  },
  page: {
    queue: {
      wait: oc
        .errors({...noQueue, ...approvalDenied})
        .input(SessionIdInput.extend({queueId: z.string().min(1), waitMs: z.number().int().min(0)}))
        .output(z.discriminatedUnion('status', [PageQueueResultSchema, PageQueueProgressSchema])),
    },
  },
  meta: {
    models: oc.errors(approvalDenied).input(SessionIdInput).output(ChatModelsSchema),
    harnesses: oc.output(ChatHarnessesSchema),
    commands: oc.errors(approvalDenied).input(SessionIdInput).output(ChatCommandsSchema),
    tools: oc.input(SessionIdInput).output(ChatToolsSchema),
    engine: oc.output(EngineStalenessSchema),
    hubAgents: oc.output(eventIterator(HubAgentsSchema)),
    connectHub: oc.errors(approvalDenied).input(HubHarnessInput).output(HubOutcome),
    disconnectHub: oc.errors(approvalDenied).input(HubHarnessInput).output(HubOutcome),
  },
  skill: {
    list: oc.errors(approvalDenied).output(locationResponse(z.array(SkillInfoSchema))),
  },
  agent: {
    list: oc.errors(approvalDenied).output(locationResponse(z.array(AgentInfoSchema))),
  },
  fs: {
    find: oc
      .errors(approvalDenied)
      .input(FileSystemFindInputSchema)
      .output(locationResponse(z.array(FileSystemEntrySchema))),
  },
  plugin: {
    call: oc
      .errors({...pluginRpcFailed, ...approvalDenied})
      .input(z.object({rpcId: z.string().min(1), method: z.string().min(1), input: z.unknown().optional()}))
      .output(z.unknown()),
    list: oc.errors(approvalDenied).output(locationResponse(z.array(PluginInfoSchema))),
    experimental: oc
      .errors({...pluginNotFound, ...pluginChunkNotFound, ...approvalDenied})
      .input(z.object({id: PluginIdSchema}))
      .output(locationResponse(PluginExperimentalBundleSchema)),
    experimentalChunk: oc
      .errors({...pluginNotFound, ...pluginChunkNotFound, ...approvalDenied})
      .input(z.object({id: PluginIdSchema, file: PluginChunkFileSchema}))
      .output(locationResponse(PluginExperimentalChunksSchema)),
  },
  experimental: {
    persistentPty: {
      create: oc
        .errors({...noTty, ...approvalDenied})
        .input(z.object({sessionId: SessionId, size: PtySizeSchema.optional(), model: z.string().min(1).optional()}))
        .output(PersistentPtyInfoSchema),
      remove: oc
        .errors({...ptyNotFound, ...ptyBusy, ...approvalDenied})
        .input(PtyIdInput)
        .output(Ok),
      output: oc
        .errors({...ptyNotFound, ...slowConsumer, ...approvalDenied})
        .input(PtyIdInput.extend({cursor: PtyCursorSchema.optional()}))
        .output(eventIterator(PtyOutputItemSchema)),
      write: oc
        .errors({...ptyNotFound, ...approvalDenied})
        .input(PtyIdInput.extend({data: z.string().min(1).max(PTY_WRITE_MAX)}))
        .output(Ok),
      resize: oc
        .errors({...ptyNotFound, ...approvalDenied})
        .input(PtyIdInput.extend(PtySizeSchema.shape))
        .output(Ok),
      inject: oc
        .errors({...ptyNotFound, ...approvalDenied})
        .input(PtyIdInput.extend({text: z.string().min(1).max(4096)}))
        .output(Ok),
    },
  },
  event: {
    subscribe: oc
      .errors(approvalDenied)
      .input(z.object({types: z.array(z.string().min(1)).optional()}).optional())
      .output(eventIterator(EventEnvelopeSchema)),
  },
}
