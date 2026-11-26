import {homedir} from 'node:os'
import {join} from 'node:path'
import type {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/types/chat-types'
import type {ChatPart, ChatMessage} from '@conciv/types/chat-message-types'
import type {
  HarnessHistory,
  HarnessListPage,
  HarnessListScope,
  HarnessSessionMeta,
  HarnessSessionPage,
  TranscriptPage,
  TranscriptTailOptions,
} from '@conciv/types/harness-types'
import {realpathOrSelf, sameCwd} from '../_shared/cwd.js'
import {parseJsonOrNull} from '../init/json.js'
import {pageAfter} from '../_shared/page.js'
import {withDatabase} from '../_shared/read-database.js'

const MAX_TITLE = 80

export function storagePath(dataHome: string | undefined): string {
  return join(dataHome || join(homedir(), '.local', 'share'), 'opencode', 'opencode.db')
}

const SessionRowSchema = z
  .object({
    id: HarnessSessionId,
    directory: z.string(),
    title: z.string().nullish(),
    time_created: z.number().nullish(),
    time_updated: z.number().nullish(),
    model: z.string().nullish(),
    tokens_input: z.number().nullish(),
    tokens_output: z.number().nullish(),
  })
  .loose()

const DataRowSchema = z.object({id: z.string(), data: z.string()}).loose()
const StampedRowSchema = DataRowSchema.extend({time_created: z.number()})
const PartRowSchema = z.object({message_id: z.string(), data: z.string()}).loose()

function parseRows<T extends z.ZodType>(schema: T, rows: unknown[]): z.infer<T>[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

const MessageDataSchema = z.object({role: z.enum(['user', 'assistant'])}).loose()
const TextPartSchema = z.object({type: z.literal('text'), text: z.string()}).loose()
const ReasoningPartSchema = z.object({type: z.literal('reasoning'), text: z.string()}).loose()
const ToolPartSchema = z
  .object({
    type: z.literal('tool'),
    callID: z.string(),
    tool: z.string(),
    state: z
      .object({
        status: z.string(),
        input: z.unknown().optional(),
        output: z.string().nullish(),
        error: z.string().nullish(),
      })
      .loose(),
  })
  .loose()

function toolParts(data: unknown): ChatPart[] {
  const tool = ToolPartSchema.safeParse(data)
  if (!tool.success) return []
  const call: ChatPart = {
    type: 'tool-call',
    id: tool.data.callID,
    name: tool.data.tool,
    arguments: JSON.stringify(tool.data.state.input ?? {}),
    state: 'input-complete',
  }
  const failed = tool.data.state.status === 'error'
  if (!failed && tool.data.state.status !== 'completed') return [call]
  const content = (failed ? tool.data.state.error : tool.data.state.output) ?? ''
  return [call, {type: 'tool-result', toolCallId: tool.data.callID, content, state: failed ? 'error' : 'complete'}]
}

function partsFrom(data: unknown): ChatPart[] {
  const text = TextPartSchema.safeParse(data)
  if (text.success) return text.data.text ? [{type: 'text', content: text.data.text}] : []

  const reasoning = ReasoningPartSchema.safeParse(data)
  if (reasoning.success) return reasoning.data.text ? [{type: 'thinking', content: reasoning.data.text}] : []

  return toolParts(data)
}

const SESSION_BY_ID = 'select * from session where id = ? limit 1'
const LIST_SESSIONS =
  'select * from session where (? is null or directory = ?) and time_archived is null and (? is null or (coalesce(time_updated, 0), id) < (?, ?)) order by coalesce(time_updated, 0) desc, id desc limit ?'
const MESSAGES_OF = 'select id, data from message where session_id = ? order by time_created asc, id asc'
const PARTS_OF = 'select message_id, data from part where session_id = ? order by time_created asc, id asc'
const TAIL_MESSAGES =
  'select id, data, time_created from message where session_id = ? and (? is null or (time_created, id) < (?, ?)) order by time_created desc, id desc limit ?'
const TAIL_PARTS =
  'select message_id, data from part where session_id = ? and message_id in (select value from json_each(?)) order by time_created asc, id asc'

function sessionRow(db: DatabaseSync, sessionId: string): z.infer<typeof SessionRowSchema> | null {
  return parseRows(SessionRowSchema, db.prepare(SESSION_BY_ID).all(sessionId)).at(0) ?? null
}

function condense(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function buildMessages(
  messageRows: {id: string; data: string}[],
  partRows: {message_id: string; data: string}[],
): ChatMessage[] {
  const partsByMessage = new Map<string, ChatPart[]>()
  for (const row of partRows) {
    const parts = partsFrom(parseJsonOrNull(row.data))
    if (parts.length === 0) continue
    partsByMessage.set(row.message_id, [...(partsByMessage.get(row.message_id) ?? []), ...parts])
  }
  return messageRows.flatMap((row) => {
    const message = MessageDataSchema.safeParse(parseJsonOrNull(row.data))
    if (!message.success) return []
    const parts = partsByMessage.get(row.id) ?? []
    return parts.length > 0 ? [{id: row.id, role: message.data.role, parts}] : []
  })
}

async function transcriptMessages(
  dbPath: string,
  cwd: string,
  sessionId: string,
  options: {signal?: AbortSignal} = {},
): Promise<ChatMessage[]> {
  options.signal?.throwIfAborted()
  return withDatabase<ChatMessage[]>(dbPath, [], (db) => {
    const session = sessionRow(db, sessionId)
    if (!session || !sameCwd(session.directory, cwd)) return []
    const messageRows = parseRows(DataRowSchema, db.prepare(MESSAGES_OF).all(sessionId))
    const partRows = parseRows(PartRowSchema, db.prepare(PARTS_OF).all(sessionId))
    return buildMessages(messageRows, partRows)
  })
}

const RowCursorSchema = z
  .string()
  .regex(/^\d+:.+$/)
  .transform((cursor) => {
    const separator = cursor.indexOf(':')
    return {created: Number(cursor.slice(0, separator)), id: cursor.slice(separator + 1)}
  })

async function transcriptTail(
  dbPath: string,
  cwd: string,
  sessionId: string,
  options: TranscriptTailOptions,
): Promise<TranscriptPage> {
  options.signal?.throwIfAborted()
  const cursor = options.before === null ? null : RowCursorSchema.safeParse(options.before)
  return withDatabase<TranscriptPage>(dbPath, {messages: [], earlier: null}, (db) => {
    const session = sessionRow(db, sessionId)
    if (!session || !sameCwd(session.directory, cwd) || cursor?.success === false) return {messages: [], earlier: null}
    const created = cursor?.data.created ?? null
    const rows = parseRows(
      StampedRowSchema,
      db.prepare(TAIL_MESSAGES).all(sessionId, created, created, cursor?.data.id ?? null, options.limit + 1),
    )
    const kept = rows.slice(0, options.limit).toReversed()
    const oldest = kept.at(0)
    const partRows = parseRows(
      PartRowSchema,
      db.prepare(TAIL_PARTS).all(sessionId, JSON.stringify(kept.map((row) => row.id))),
    )
    return {
      messages: buildMessages(kept, partRows),
      earlier: rows.length > options.limit && oldest !== undefined ? `${oldest.time_created}:${oldest.id}` : null,
    }
  })
}

async function listSessions(
  dbPath: string,
  scope: HarnessListScope,
  page: HarnessListPage,
): Promise<HarnessSessionPage> {
  const after = page.after
  const projectCwd = 'cwd' in scope ? realpathOrSelf(scope.cwd) : null
  return withDatabase<HarnessSessionPage>(dbPath, {sessions: [], next: null}, (db) => {
    const rows = parseRows(
      SessionRowSchema,
      db
        .prepare(LIST_SESSIONS)
        .all(
          projectCwd,
          projectCwd,
          after?.updatedAt ?? null,
          after?.updatedAt ?? null,
          after?.id ?? null,
          page.limit + 1,
        ),
    )
    const paged = pageAfter(rows, page, (row) => ({updatedAt: row.time_updated ?? 0, id: row.id}))
    return {sessions: paged.items.map(sessionMeta), next: paged.next}
  })
}

async function storedMeta(dbPath: string, cwd: string, sessionId: string): Promise<HarnessSessionMeta | null> {
  return withDatabase<HarnessSessionMeta | null>(dbPath, null, (db) => {
    const row = sessionRow(db, sessionId)
    if (!row || !sameCwd(row.directory, cwd)) return null
    return sessionMeta(row)
  })
}

function sessionMeta(row: z.infer<typeof SessionRowSchema>): HarnessSessionMeta {
  return {
    id: row.id,
    cwd: row.directory,
    derivedTitle: condense(row.title, MAX_TITLE),
    updatedAt: row.time_updated ?? 0,
    model: row.model ?? null,
    totalTokens: (row.tokens_input ?? 0) + (row.tokens_output ?? 0),
    lastMessage: null,
    createdAt: row.time_created ?? undefined,
  }
}

export function opencodeHistory(dbPath: string): HarnessHistory {
  return {
    messages: (cwd, sessionId, options) => transcriptMessages(dbPath, cwd, sessionId, options),
    tail: (cwd, sessionId, options) => transcriptTail(dbPath, cwd, sessionId, options),
    list: (scope, page) => listSessions(dbPath, scope, page),
    meta: (cwd, sessionId) => storedMeta(dbPath, cwd, sessionId),
  }
}
