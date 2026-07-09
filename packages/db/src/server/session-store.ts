import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'
import {recordsClient} from './records.js'
import {sessionRecordToRow, sessionRowToRecord, type SessionRowInput, type SessionStatus} from '../rows.js'
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

function copyColumn<K extends keyof SessionRowInput>(
  out: Partial<SessionRowInput>,
  row: SessionRowInput,
  column: K,
): void {
  out[column] = row[column]
}

function patchedColumns(patch: Partial<SessionRecordInput>, row: SessionRowInput): Partial<SessionRowInput> {
  const columns = Object.keys(patch).flatMap((key) => {
    const column = COLUMN_FOR[key]
    return column === undefined ? [] : [column]
  })
  const out: Partial<SessionRowInput> = {updated_at: row.updated_at}
  for (const column of columns) copyColumn(out, row, column)
  return out
}

export function createTrailBaseSessionStore(opts: {baseUrl: string; now?: () => number}): SessionStore {
  const now = opts.now ?? Date.now
  const client = recordsClient(opts.baseUrl)
  const rowFor = (sessionId: string) => client.getBy('sessions', 'session_id', sessionId)
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
    list: async () => (await client.list('sessions')).map(sessionRowToRecord),
    findByHarnessId: async (harnessSessionId) => {
      const row = await client.getBy('sessions', 'harness_session_id', harnessSessionId)
      return row === null ? null : sessionRowToRecord(row)
    },
    setStatus: async (id, status) => {
      const row = await mustRow(id)
      await client.update('sessions', row.id, {status, updated_at: now()})
    },
  }
}
