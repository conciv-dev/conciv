import {sessions} from '@conciv/backend-app-api/core/session/sql'
import {eq} from 'drizzle-orm'
import {Effect} from 'effect'
import type {ConcivDb} from './connection.js'

export async function readModel(db: ConcivDb, id: string): Promise<string | null> {
  const rows = await Effect.runPromise(db.select({model: sessions.model}).from(sessions).where(eq(sessions.id, id)))
  return rows[0]?.model ?? null
}
