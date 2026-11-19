import {Effect} from 'effect'
import type {Store} from './store.js'

export const autoCommitDraft = Effect.fn('whiteboard.autoCommitDraft')(function* (store: Store, room: string) {
  const drafts = yield* store.listElements('draft', room)
  if (!drafts.length) return false
  const pendingCommits = (yield* store.pending.list(room)).filter((row) => row.kind === 'commit')
  if (pendingCommits.length) return false
  yield* store.pending.insert(room, {id: crypto.randomUUID(), room, kind: 'commit', stage: 'live', payload: {}})
  return true
})
