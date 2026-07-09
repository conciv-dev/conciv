import {z} from 'zod'
import {SessionId, type SessionRecord} from '@conciv/protocol/chat-types'
import {UsageSnapshotSchema} from '@conciv/protocol/usage-types'

export const SessionStatusSchema = z.enum(['idle', 'thinking', 'streaming', 'compacting'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionRowSchema = z.object({
  id: z.string(),
  session_id: SessionId,
  harness_session_id: z.string().nullable(),
  harness_kind: z.string(),
  origin: z.enum(['chat', 'agent', 'external']),
  title: z.string().nullable(),
  model: z.string().nullable(),
  usage: z.string().nullable(),
  status: SessionStatusSchema.default('idle'),
  cwd: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type SessionRow = z.infer<typeof SessionRowSchema>
export type SessionRowInput = Omit<SessionRow, 'id' | 'status'>

export const DraftRowSchema = z.object({
  id: z.string(),
  session_id: SessionId,
  text: z.string(),
  selection_start: z.number(),
  selection_end: z.number(),
  grabs: z.string(),
  scroll_top: z.number().nullable(),
  updated_at: z.number(),
})
export type DraftRow = z.infer<typeof DraftRowSchema>

export const MarkerRowSchema = z.object({
  id: z.string(),
  session_id: SessionId,
  after_turn: z.number(),
  kind: z.enum(['new', 'compact']),
  pending: z.number(),
  created_at: z.number(),
})
export type MarkerRow = z.infer<typeof MarkerRowSchema>

export type CoreTableName = 'sessions' | 'drafts' | 'markers'

type RowMap = {
  sessions: z.infer<typeof SessionRowSchema>
  drafts: z.infer<typeof DraftRowSchema>
  markers: z.infer<typeof MarkerRowSchema>
}

type RowInputMap = {
  sessions: z.input<typeof SessionRowSchema>
  drafts: z.input<typeof DraftRowSchema>
  markers: z.input<typeof MarkerRowSchema>
}

export type RowFor<K extends CoreTableName> = RowMap[K]
export type RowInputFor<K extends CoreTableName> = Omit<RowInputMap[K], 'id'>

export const TABLES: {[K in CoreTableName]: {schema: z.ZodType<RowMap[K], RowInputMap[K]>}} = {
  sessions: {schema: SessionRowSchema},
  drafts: {schema: DraftRowSchema},
  markers: {schema: MarkerRowSchema},
}

export function sessionRecordToRow(record: SessionRecord): SessionRowInput {
  return {
    session_id: record.id,
    harness_session_id: record.harnessSessionId,
    harness_kind: record.harnessKind,
    origin: record.origin,
    title: record.title,
    model: record.model,
    usage: record.usage === null ? null : JSON.stringify(record.usage),
    cwd: record.cwd,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

export function sessionRowToRecord(row: SessionRow): SessionRecord {
  return {
    id: row.session_id,
    harnessSessionId: row.harness_session_id,
    harnessKind: row.harness_kind,
    origin: row.origin,
    title: row.title,
    model: row.model,
    usage: row.usage === null ? null : UsageSnapshotSchema.parse(JSON.parse(row.usage)),
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
