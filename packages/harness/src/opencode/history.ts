import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync, type StatementSync} from 'node:sqlite'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {ChatPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import type {
  HarnessHistory,
  HarnessListPage,
  HarnessListScope,
  HarnessSessionMeta,
  HarnessSessionPage,
  TranscriptChunk,
  TranscriptFailure,
  TranscriptHandle,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import {realpathOrSelf, sameCwd} from '../_shared/cwd.js'
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {transcriptFailure} from '../_shared/jsonl-handle.js'
import {pageAfter} from '../_shared/page.js'

const MAX_TITLE = 80

export function storagePath(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'opencode', 'opencode.db')
}

function withDatabase<T>(absent: T, run: (db: DatabaseSync) => T): T {
  const path = storagePath()
  if (!existsSync(path)) return absent
  const db = new DatabaseSync(path, {readOnly: true})
  try {
    return run(db)
  } finally {
    db.close()
  }
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
const PartRowSchema = z.object({message_id: z.string(), data: z.string()}).loose()
const StatRowSchema = z.object({latest: z.number().nullish(), parts: z.number().nullish()}).loose()

function rowsOf<T extends z.ZodType>(schema: T, rows: unknown[]): z.infer<T>[] {
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
const STAT_OF =
  'select (select max(time_updated) from message where session_id = ?) as latest, (select count(*) from part where session_id = ?) as parts'

function sessionRow(db: DatabaseSync, sessionId: string): z.infer<typeof SessionRowSchema> | null {
  return rowsOf(SessionRowSchema, db.prepare(SESSION_BY_ID).all(sessionId)).at(0) ?? null
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

async function transcriptMessages(cwd: string, sessionId: string): Promise<ChatMessage[]> {
  return withDatabase<ChatMessage[]>([], (db) => {
    const session = sessionRow(db, sessionId)
    if (!session || !sameCwd(session.directory, cwd)) return []
    const messageRows = rowsOf(DataRowSchema, db.prepare(MESSAGES_OF).all(sessionId))
    const partRows = rowsOf(PartRowSchema, db.prepare(PARTS_OF).all(sessionId))
    return buildMessages(messageRows, partRows)
  })
}

async function listSessions(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage> {
  const after = page.after
  const projectCwd = 'cwd' in scope ? realpathOrSelf(scope.cwd) : null
  return withDatabase<HarnessSessionPage>({sessions: [], next: null}, (db) => {
    const rows = rowsOf(
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

async function storedMeta(cwd: string, sessionId: string): Promise<HarnessSessionMeta | null> {
  return withDatabase<HarnessSessionMeta | null>(null, (db) => {
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

type OpencodeSession = {db: DatabaseSync; statements: OpencodeStatements}

type OpencodeStatements = {
  session: StatementSync
  stat: StatementSync
  messages: StatementSync
  parts: StatementSync
}

function openSession(cwd: string, sessionId: string): OpencodeSession | TranscriptFailure {
  const path = storagePath()
  if (!existsSync(path)) return transcriptFailure('missing', `no opencode database at ${path}`)
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(path, {readOnly: true})
    const statements: OpencodeStatements = {
      session: db.prepare(SESSION_BY_ID),
      stat: db.prepare(STAT_OF),
      messages: db.prepare(MESSAGES_OF),
      parts: db.prepare(PARTS_OF),
    }
    const session = rowsOf(SessionRowSchema, statements.session.all(sessionId)).at(0)
    if (!session || !sameCwd(session.directory, cwd)) {
      db.close()
      return transcriptFailure('missing', `opencode session ${sessionId} is not recorded in ${cwd}`)
    }
    return {db, statements}
  } catch (error) {
    db?.close()
    return transcriptFailure('unreadable', `${path}: ${String(error)}`)
  }
}

function revisionOf(statements: OpencodeStatements, sessionId: string): TranscriptRevision | TranscriptFailure {
  try {
    const row = rowsOf(StatRowSchema, statements.stat.all(sessionId, sessionId)).at(0)
    const latest = row?.latest ?? 0
    return {rev: `${latest}:${row?.parts ?? 0}`, changedAt: latest}
  } catch (error) {
    return transcriptFailure('unreadable', `opencode stat for ${sessionId}: ${String(error)}`)
  }
}

function observeTranscript(cwd: string, sessionId: string): TranscriptHandle {
  const state: {open: OpencodeSession | null; closed: boolean} = {open: null, closed: false}

  const connect = (): OpencodeSession | TranscriptFailure => {
    if (state.closed) return transcriptFailure('unreadable', 'transcript handle closed')
    if (state.open) return state.open
    const opened = openSession(cwd, sessionId)
    if ('ok' in opened) return opened
    state.open = opened
    return opened
  }

  return {
    revision(): Promise<TranscriptRevision | TranscriptFailure> {
      const session = connect()
      if ('ok' in session) return Promise.resolve(session)
      return Promise.resolve(revisionOf(session.statements, sessionId))
    },
    read(): Promise<TranscriptChunk | TranscriptFailure> {
      const session = connect()
      if ('ok' in session) return Promise.resolve(session)
      const rev = revisionOf(session.statements, sessionId)
      if ('ok' in rev) return Promise.resolve(rev)
      try {
        const messageRows = rowsOf(DataRowSchema, session.statements.messages.all(sessionId))
        const partRows = rowsOf(PartRowSchema, session.statements.parts.all(sessionId))
        return Promise.resolve({ok: true, ...rev, messages: buildMessages(messageRows, partRows), replaced: true})
      } catch (error) {
        return Promise.resolve(transcriptFailure('unreadable', `opencode rows for ${sessionId}: ${String(error)}`))
      }
    },
    close(): void {
      state.closed = true
      state.open?.db.close()
      state.open = null
    },
  }
}

export const opencodeHistory: HarnessHistory = {
  messages: transcriptMessages,
  observe: observeTranscript,
  list: listSessions,
  meta: storedMeta,
}
