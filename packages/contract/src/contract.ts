import {eventIterator, oc} from '@orpc/contract'
import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import {
  ChatCommandsSchema,
  ChatLaunchSchema,
  ChatModelsSchema,
  ChatToolsSchema,
  PermissionDecisionSchema,
} from '@conciv/protocol/chat-types'
import {UiAnswerValueSchema} from '@conciv/protocol/ui-types'
import {OpenSourceResultSchema, OpenSourceSchema, PageReplySchema} from '@conciv/protocol/page-types'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from './rows.js'

const StreamChunkSchema = z.custom<StreamChunk>((value) => typeof value === 'object' && value !== null)

const SessionIdInput = z.object({sessionId: z.string()})
const Ok = z.object({ok: z.literal(true)})
const busy = {BUSY: {message: 'session busy'}}
const notFound = {NOT_FOUND: {message: 'session not found'}}

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
    queries: oc.output(eventIterator(z.object({requestId: z.string(), query: z.unknown()}))),
    reply: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending request'}})
      .input(PageReplySchema)
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
