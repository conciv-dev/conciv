import {and, eq} from 'drizzle-orm'
import {canvasPending} from './db/schema.js'
import type {Store} from './db/store.js'

export async function autoCommitDraft(store: Store, room: string): Promise<boolean> {
  const drafts = await store.listElements('draft', room)
  if (!drafts.length) return false
  const pendingCommits = await store.db
    .select()
    .from(canvasPending)
    .where(and(eq(canvasPending.room, room), eq(canvasPending.kind, 'commit')))
  if (pendingCommits.length) return false
  await store.insertPending({id: crypto.randomUUID(), room, kind: 'commit', stage: 'live', payload: {}})
  return true
}
