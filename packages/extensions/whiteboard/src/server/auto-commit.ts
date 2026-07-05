import type {Db} from 'jazz-tools/backend'
import type {JsonValue} from 'jazz-tools'
import {app} from '../shared/schema.js'

export async function autoCommitDraft(db: Db, room: string): Promise<boolean> {
  const drafts = await db.all(app.canvasDraftElements.where({room}), {tier: 'global'})
  if (!drafts.length) return false
  const pendingCommits = await db.all(app.canvasPending.where({room, kind: 'commit'}), {tier: 'global'})
  if (pendingCommits.length) return false
  await db.insert(app.canvasPending, {room, kind: 'commit', stage: 'live', payload: {} as JsonValue}).wait({tier: 'edge'})
  return true
}
