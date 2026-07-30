import {homedir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {HarnessHistory, HarnessSessionMeta, TranscriptStat} from '@conciv/protocol/harness-types'

const MAX_SESSIONS = 50
const MAX_TITLE = 80

export function storagePath(home: string = homedir()): string {
  return join(home, '.local', 'share', 'opencode', 'opencode.db')
}

function withDatabase<T>(home: string, fallback: T, run: (db: DatabaseSync) => T): T {
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(storagePath(home), {readOnly: true})
    return run(db)
  } catch {
    return fallback
  } finally {
    db?.close()
  }
}

const SessionRowSchema = z
  .object({
    id: z.string(),
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
const CountRowSchema = z.object({session_id: z.string(), total: z.number()}).loose()
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

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function toolParts(data: unknown): MessagePart[] {
  const tool = ToolPartSchema.safeParse(data)
  if (!tool.success) return []
  const call: MessagePart = {
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

function partsFrom(data: unknown): MessagePart[] {
  const text = TextPartSchema.safeParse(data)
  if (text.success) return text.data.text ? [{type: 'text', content: text.data.text}] : []

  const reasoning = ReasoningPartSchema.safeParse(data)
  if (reasoning.success) return reasoning.data.text ? [{type: 'thinking', content: reasoning.data.text}] : []

  return toolParts(data)
}

const SESSION_BY_ID = 'select * from session where id = ? limit 1'
const LIST_SESSIONS = `select * from session where directory = ? and time_archived is null order by time_updated desc limit ${MAX_SESSIONS}`
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
): UIMessage[] {
  const partsByMessage = new Map<string, MessagePart[]>()
  for (const row of partRows) {
    const parts = partsFrom(parseJson(row.data))
    if (parts.length === 0) continue
    partsByMessage.set(row.message_id, [...(partsByMessage.get(row.message_id) ?? []), ...parts])
  }
  return messageRows.flatMap((row, index) => {
    const message = MessageDataSchema.safeParse(parseJson(row.data))
    if (!message.success) return []
    const parts = partsByMessage.get(row.id) ?? []
    return parts.length > 0 ? [{id: `h${index + 1}`, role: message.data.role, parts}] : []
  })
}

export async function transcriptMessages(
  cwd: string,
  sessionId: string,
  home: string = homedir(),
): Promise<UIMessage[]> {
  return withDatabase<UIMessage[]>(home, [], (db) => {
    const session = sessionRow(db, sessionId)
    if (!session || session.directory !== cwd) return []
    const messageRows = rowsOf(DataRowSchema, db.prepare(MESSAGES_OF).all(sessionId))
    const partRows = rowsOf(PartRowSchema, db.prepare(PARTS_OF).all(sessionId))
    return buildMessages(messageRows, partRows)
  })
}

export async function transcriptStat(
  cwd: string,
  sessionId: string,
  home: string = homedir(),
): Promise<TranscriptStat | null> {
  return withDatabase<TranscriptStat | null>(home, null, (db) => {
    const session = sessionRow(db, sessionId)
    if (!session || session.directory !== cwd) return null
    const stat = rowsOf(StatRowSchema, db.prepare(STAT_OF).all(sessionId, sessionId)).at(0)
    const latest = Math.max(session.time_updated ?? 0, stat?.latest ?? 0)
    return {mtimeMs: latest, size: stat?.parts ?? 0}
  })
}

function messageCounts(db: DatabaseSync, ids: string[]): Map<string, number> {
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `select session_id, count(*) as total from message where session_id in (${placeholders}) group by session_id`,
    )
    .all(...ids)
  return new Map(rowsOf(CountRowSchema, rows).map((row) => [row.session_id, row.total]))
}

export async function listSessions(cwd: string, home: string = homedir()): Promise<HarnessSessionMeta[]> {
  return withDatabase<HarnessSessionMeta[]>(home, [], (db) => {
    const sessions = rowsOf(SessionRowSchema, db.prepare(LIST_SESSIONS).all(cwd))
    const counts = messageCounts(
      db,
      sessions.map((session) => session.id),
    )
    return sessions.map((session) => ({
      id: session.id,
      derivedTitle: condense(session.title, MAX_TITLE),
      updatedAt: session.time_updated ?? 0,
      messageCount: counts.get(session.id) ?? 0,
      model: session.model ?? null,
      totalTokens: (session.tokens_input ?? 0) + (session.tokens_output ?? 0),
      lastMessage: null,
      createdAt: session.time_created ?? undefined,
    }))
  })
}

export const opencodeHistory: HarnessHistory = {
  messages: transcriptMessages,
  transcriptStat,
  list: listSessions,
}
