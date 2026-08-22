import {desc, eq} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {settingsLog} from './settings-schema.js'

export type SettingsLogActor = 'user' | 'agent'

export type SettingsLogRow = {
  id: number
  key: string
  value: string | null
  actor: SettingsLogActor
  createdAt: number
}

type SettingsDb = Pick<ConcivDb, 'select' | 'insert'>

export function appendSettingsLog(
  db: SettingsDb,
  entry: {key: string; value: string | null; actor: SettingsLogActor},
): void {
  db.insert(settingsLog).values({key: entry.key, value: entry.value, actor: entry.actor, createdAt: Date.now()}).run()
}

export function newestSettingsLogRow(db: SettingsDb, key: string): SettingsLogRow | null {
  const rows = db
    .select()
    .from(settingsLog)
    .where(eq(settingsLog.key, key))
    .orderBy(desc(settingsLog.id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

export function settingsLogHistory(db: SettingsDb, key: string): SettingsLogRow[] {
  return db.select().from(settingsLog).where(eq(settingsLog.key, key)).orderBy(desc(settingsLog.id)).all()
}
