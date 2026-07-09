import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'
import {recordsClient} from './records.js'
import {
  SessionRowSchema,
  sessionRecordToRow,
  sessionRowToRecord,
  type SessionRowInput,
  type SessionStatus,
} from '../rows.js'
import {stateError} from '../errors.js'

export type SessionStore = {
  create(record: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecordInput>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
  setStatus(id: string, status: SessionStatus): Promise<void>
}

const COLUMN_FOR: Record<string, keyof SessionRowInput> = {
  harnessSessionId: 'harness_session_id',
  harnessKind: 'harness_kind',
  origin: 'origin',
  title: 'title',
  model: 'model',
  usage: 'usage',
  cwd: 'cwd',
  createdAt: 'created_at',
}

function patchedColumns(patch: Partial<SessionRecordInput>, row: SessionRowInput): Record<string, unknown> {
  const columns = Object.keys(patch).flatMap((key) => {
    const column = COLUMN_FOR[key]
    return column === undefined ? [] : [column]
  })
  return Object.fromEntries([...columns.map((column) => [column, row[column]]), ['updated_at', row.updated_at]])
}

export function createTrailBaseSessionStore(opts: {baseUrl: string; now?: () => number}): SessionStore {
  const now = opts.now ?? Date.now
  const client = recordsClient(opts.baseUrl)
  const rowFor = async (sessionId: string) => {
    const raw = await client.getBy('sessions', 'session_id', sessionId)
    return raw === null ? null : SessionRowSchema.parse(raw)
  }
  const mustRow = async (sessionId: string) => {
    const row = await rowFor(sessionId)
    if (!row) throw stateError('record-not-found', `session ${sessionId} not found`, {api: 'sessions', sessionId})
    return row
  }
  return {
    create: async (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      await client.create('sessions', sessionRecordToRow(record))
      return record
    },
    get: async (id) => {
      const row = await rowFor(id)
      return row ? sessionRowToRecord(row) : null
    },
    update: async (id, patch) => {
      const row = await mustRow(id)
      const merged = SessionRecordSchema.parse({
        ...sessionRowToRecord(row),
        ...patch,
        id: row.session_id,
        updatedAt: now(),
      })
      await client.update('sessions', row.id, patchedColumns(patch, sessionRecordToRow(merged)))
      return merged
    },
    delete: async (id) => {
      const row = await rowFor(id)
      if (row) await client.remove('sessions', row.id)
    },
    list: async () => {
      const rows = await client.list('sessions')
      return rows.map((raw) => sessionRowToRecord(SessionRowSchema.parse(raw)))
    },
    findByHarnessId: async (harnessSessionId) => {
      const raw = await client.getBy('sessions', 'harness_session_id', harnessSessionId)
      return raw === null ? null : sessionRowToRecord(SessionRowSchema.parse(raw))
    },
    setStatus: async (id, status) => {
      const row = await mustRow(id)
      await client.update('sessions', row.id, {status, updated_at: now()})
    },
  }
}
