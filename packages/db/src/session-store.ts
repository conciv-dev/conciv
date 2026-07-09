import {eq} from 'drizzle-orm'
import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'

export type SessionStore = {
  create(record: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecordInput>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
  watch(listener: () => void): () => void
}

function rowToRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return SessionRecordSchema.parse(row)
}

export function makeSessionStore(opts: {db: ConcivDb; now?: () => number}): SessionStore {
  const db = opts.db
  const now = opts.now ?? Date.now
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  const read = async (id: string) => {
    const rows = await db.select().from(sessions).where(eq(sessions.id, id))
    return rows[0] ? rowToRecord(rows[0]) : null
  }
  return {
    create: async (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      await db.insert(sessions).values(record)
      emit()
      return record
    },
    get: read,
    update: async (id, patch) => {
      const current = await read(id)
      if (!current) throw new Error(`session ${id} not found`)
      const next = SessionRecordSchema.parse({...current, ...patch, id: current.id, updatedAt: now()})
      await db.update(sessions).set(next).where(eq(sessions.id, id))
      emit()
      return next
    },
    delete: async (id) => {
      await db.delete(sessions).where(eq(sessions.id, id))
      emit()
    },
    list: async () => (await db.select().from(sessions)).map(rowToRecord),
    findByHarnessId: async (harnessSessionId) => {
      const rows = await db.select().from(sessions).where(eq(sessions.harnessSessionId, harnessSessionId))
      return rows[0] ? rowToRecord(rows[0]) : null
    },
    watch: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
