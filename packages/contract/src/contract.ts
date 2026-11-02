import {eventIterator, oc} from '@orpc/contract'
import {z} from 'zod'
import {type ChatEvent, RunLifecycleSchema} from '@conciv/protocol/chat-event-types'
import {
  ChatCommandsSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatToolsSchema,
  NativeSessionRefSchema,
  NavigationWriteSchema,
  PermissionDecisionSchema,
  SessionId,
} from '@conciv/protocol/chat-types'
import {UiAnswerValueSchema} from '@conciv/protocol/ui-types'
import {
  OpenSourceResultSchema,
  OpenSourceSchema,
  PageChangeEntrySchema,
  SourceLocSchema,
  SymbolicateSchema,
} from '@conciv/protocol/page-types'
import {BundlerConfigSchema, ModuleNodeSchema} from '@conciv/protocol/bundler-types'
import {SessionCapturesSchema} from '@conciv/protocol/element-capture-types'
import {TOOL_ICON_KEYS} from '@conciv/protocol/tool-icon-types'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from './rows.js'

const StreamChunkSchema = z.custom<ChatEvent>((value) => typeof value === 'object' && value !== null)

export const SessionIdInputSchema = z.object({sessionId: SessionId})
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
  activeRun: z.object({runId: z.string()}).nullable(),
  lastRun: RunLifecycleSchema.nullable(),
  pendingApprovals: z.array(ChatPendingApprovalSchema),
  interrupts: z.object({runId: z.string(), pending: z.array(ChatPendingInterruptSchema)}).nullable(),
})
export type ChatHydration = z.infer<typeof ChatHydrationSchema>
export const OkSchema = z.object({ok: z.literal(true)})
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

export const SessionsListInputSchema = z.object({includeHidden: z.boolean().optional()})
export const SessionsListOutputSchema = z.array(SessionMetaSchema)
export const SessionsResolveInputSchema = z.object({id: z.string().optional()})
export const SessionsRenameInputSchema = SessionIdInputSchema.extend({title: z.string().min(1).max(120)})
export const SessionsRenameOutputSchema = z.object({title: z.string()})
export const SessionsModelInputSchema = SessionIdInputSchema.extend({model: z.string()})
export const SessionsModelOutputSchema = z.object({model: z.string()})
export const sessionsRenameErrors = notFound
export const sessionsModelErrors = {...notFound, UNKNOWN_MODEL: {message: 'unknown or disabled model'}}

export const DraftsGetOutputSchema = DraftRowSchema.nullable()
export const DraftsSetInputSchema = DraftRowSchema.omit({updatedAt: true})
export const MarkersListOutputSchema = z.array(MarkerRowSchema)
export const NavigationGetOutputSchema = NavigationWriteSchema.nullable()
export const NavigationSetOutputSchema = z.object({ok: z.literal(true), applied: z.boolean()})
export const PageSymbolicateOutputSchema = SourceLocSchema.nullable()
export const PageChangesOutputSchema = z.array(PageChangeEntrySchema)

export const contract = {
  sessions: {
    list: oc.input(SessionsListInputSchema.nullish()).output(SessionsListOutputSchema),
    create: oc.output(SessionIdInputSchema),
    resolve: oc.input(SessionsResolveInputSchema).output(SessionIdInputSchema),
    open: oc.input(NativeSessionRefSchema).output(SessionIdInputSchema),
    restore: oc.input(SessionIdInputSchema).output(SessionIdInputSchema),
    rename: oc.errors(sessionsRenameErrors).input(SessionsRenameInputSchema).output(SessionsRenameOutputSchema),
    delete: oc.input(SessionIdInputSchema).output(OkSchema),
    model: oc.errors(sessionsModelErrors).input(SessionsModelInputSchema).output(SessionsModelOutputSchema),
    compact: oc.input(SessionIdInputSchema).output(OkSchema),
  },
  drafts: {
    get: oc.input(SessionIdInputSchema).output(DraftsGetOutputSchema),
    set: oc.input(DraftsSetInputSchema).output(OkSchema),
  },
  markers: {
    list: oc.input(SessionIdInputSchema).output(MarkersListOutputSchema),
  },
  navigation: {
    get: oc.output(NavigationGetOutputSchema),
    set: oc.input(NavigationWriteSchema).output(NavigationSetOutputSchema),
  },
  chat: {
    events: oc.input(SessionIdInputSchema).output(eventIterator(StreamChunkSchema)),
    hydrate: oc.input(SessionIdInputSchema).output(ChatHydrationSchema),
    stop: oc.input(SessionIdInputSchema.extend({runIds: z.array(z.string().min(1))})).output(OkSchema),
    permissionDecision: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending approval'}})
      .input(PermissionDecisionSchema)
      .output(OkSchema.extend({startsTurn: z.boolean()})),
    uiReply: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending ui question'}})
      .input(SessionIdInputSchema.extend({toolCallId: z.string(), value: UiAnswerValueSchema}))
      .output(OkSchema),
  },
  registry: {
    catalog: oc.output(z.array(ToolCommandSignatureSchema)),
    call: oc
      .errors(registryCallErrors)
      .input(z.object({name: z.string().min(1), input: z.record(z.string(), z.unknown())}))
      .output(z.unknown()),
  },
  captures: {
    list: oc.input(SessionIdInputSchema).output(SessionCapturesSchema),
  },
  page: {
    symbolicate: oc.input(SymbolicateSchema).output(PageSymbolicateOutputSchema),
    changes: oc.output(PageChangesOutputSchema),
    clearChanges: oc.output(OkSchema),
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
      .output(OkSchema),
    restart: oc
      .errors({...noBundler, ...approvalDenied})
      .input(z.object({force: z.boolean().default(false)}))
      .output(OkSchema),
  },
  editor: {
    open: oc.input(EditorOpenInputSchema).output(OkSchema),
    openFromFrames: oc.input(OpenSourceSchema).output(OpenSourceResultSchema),
  },
  meta: {
    models: oc.output(ChatModelsSchema),
    commands: oc.input(SessionIdInputSchema).output(ChatCommandsSchema),
    tools: oc.output(ChatToolsSchema),
    engine: oc.output(EngineStalenessSchema),
  },
}
