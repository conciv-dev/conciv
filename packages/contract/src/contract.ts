import {eventIterator, oc} from '@orpc/contract'
import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import {
  ChatCommandsSchema,
  ChatLaunchSchema,
  ChatModelsSchema,
  ChatToolsSchema,
  NavigationStateSchema,
  PermissionDecisionSchema,
} from '@conciv/protocol/chat-types'
import {UiAnswerValueSchema} from '@conciv/protocol/ui-types'
import {
  OpenSourceResultSchema,
  OpenSourceSchema,
  PageChangeEntrySchema,
  PageReplySchema,
  PageRunInputSchema,
  PageRunResultSchema,
} from '@conciv/protocol/page-types'
import {BundlerConfigSchema, ModuleNodeSchema} from '@conciv/protocol/bundler-types'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from './rows.js'

const StreamChunkSchema = z.custom<StreamChunk>((value) => typeof value === 'object' && value !== null)

const SessionIdInput = z.object({sessionId: z.string()})
const Ok = z.object({ok: z.literal(true)})
const busy = {BUSY: {message: 'session busy'}}
const notFound = {NOT_FOUND: {message: 'session not found'}}
const noBundler = {NO_BUNDLER: {message: 'no bundler bridge'}}

export const contract = {
  sessions: {
    list: oc.output(z.array(SessionMetaSchema)),
    create: oc.output(SessionIdInput),
    resolve: oc.input(z.object({id: z.string().optional()})).output(SessionIdInput),
    rename: oc
      .errors(notFound)
      .input(SessionIdInput.extend({title: z.string().min(1).max(120)}))
      .output(z.object({title: z.string()})),
    remove: oc.input(SessionIdInput).output(Ok),
    setModel: oc
      .errors({...notFound, UNKNOWN_MODEL: {message: 'unknown or disabled model'}})
      .input(SessionIdInput.extend({model: z.string()}))
      .output(z.object({model: z.string()})),
    compact: oc.errors(busy).input(SessionIdInput).output(Ok),
    stop: oc.input(SessionIdInput).output(Ok),
    launch: oc.input(SessionIdInput.extend({model: z.string().optional()})).output(ChatLaunchSchema),
  },
  drafts: {
    get: oc.input(SessionIdInput).output(DraftRowSchema.nullable()),
    set: oc.input(DraftRowSchema.omit({updatedAt: true})).output(Ok),
  },
  markers: {
    list: oc.input(SessionIdInput).output(z.array(MarkerRowSchema)),
  },
  navigation: {
    get: oc.output(NavigationStateSchema.nullable()),
    set: oc.input(NavigationStateSchema).output(Ok),
  },
  chat: {
    attach: oc.input(SessionIdInput).output(eventIterator(StreamChunkSchema)),
    send: oc
      .errors(busy)
      .input(SessionIdInput.extend({text: z.string().min(1)}))
      .output(Ok),
    permissionDecision: oc.input(PermissionDecisionSchema).output(Ok),
    uiReply: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending ui question'}})
      .input(SessionIdInput.extend({toolCallId: z.string(), value: UiAnswerValueSchema}))
      .output(Ok),
  },
  page: {
    run: oc
      .errors({
        NO_PAGE_CLIENT: {message: 'no widget connected'},
        PAGE_TIMEOUT: {message: 'page did not reply (no widget connected?)'},
      })
      .input(PageRunInputSchema)
      .output(PageRunResultSchema),
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
      .errors(noBundler)
      .input(z.object({file: z.string()}))
      .output(Ok),
    restart: oc
      .errors(noBundler)
      .input(z.object({force: z.boolean().default(false)}))
      .output(Ok),
  },
  editor: {
    open: oc.input(z.object({file: z.string(), line: z.number().int().min(1).optional()})).output(Ok),
    openFromFrames: oc.input(OpenSourceSchema).output(OpenSourceResultSchema),
  },
  meta: {
    models: oc.output(ChatModelsSchema),
    commands: oc.input(z.object({sessionId: z.string().optional()})).output(ChatCommandsSchema),
    tools: oc.output(ChatToolsSchema),
  },
}
