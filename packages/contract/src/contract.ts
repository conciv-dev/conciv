import {eventIterator, oc} from '@orpc/contract'
import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import {
  ChatContentPartSchema,
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
import {RunLifecycleSchema} from '@conciv/protocol/run-types'
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

const StreamChunkSchema = z.custom<StreamChunk>((value) => typeof value === 'object' && value !== null)

const SessionIdInput = z.object({sessionId: SessionId})
export const ChatSendInput = SessionIdInput.extend({
  runId: z.string().min(1),
  messageId: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  content: z.union([z.string().min(1), z.array(ChatContentPartSchema).min(1).max(16)]).optional(),
}).refine((input) => input.text !== undefined || input.content !== undefined)
const ChatPendingInterruptSchema = z.object({
  id: z.string(),
  reason: z.string(),
  message: z.string().optional(),
  toolCallId: z.string().optional(),
})
export const ChatHydrationSchema = z.object({
  messages: ChatHistorySchema,
  activeRun: z.object({runId: z.string()}).nullable(),
  lastRun: RunLifecycleSchema.nullable(),
  interrupts: z.object({runId: z.string(), pending: z.array(ChatPendingInterruptSchema)}).nullable(),
})
export type ChatHydration = z.infer<typeof ChatHydrationSchema>
const Ok = z.object({ok: z.literal(true)})
const SendAccepted = z.object({ok: z.literal(true), runId: z.string()})
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

export const contract = {
  sessions: {
    list: oc.input(z.object({includeHidden: z.boolean().optional()}).nullish()).output(z.array(SessionMetaSchema)),
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
    compact: oc.input(SessionIdInput).output(Ok),
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
    send: oc
      .errors({
        RUN_ID_TAKEN: {
          status: 409,
          message: 'runId already belongs to another run, live or finished',
          data: z.object({runId: z.string()}),
        },
      })
      .input(ChatSendInput)
      .output(SendAccepted),
    stop: oc.input(SessionIdInput).output(Ok),
    permissionDecision: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending approval'}})
      .input(PermissionDecisionSchema)
      .output(Ok),
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
    models: oc.output(ChatModelsSchema),
    commands: oc.input(SessionIdInput).output(ChatCommandsSchema),
    tools: oc.output(ChatToolsSchema),
    engine: oc.output(EngineStalenessSchema),
  },
}
