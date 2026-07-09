import type {RecordsClient} from '@conciv/db/server'
import type {MarkerWriter} from '../api/chat/chat-env.js'

export function markerWriter(records: RecordsClient): MarkerWriter {
  return {
    create: (sessionId, kind, afterTurn) =>
      records.create('markers', {
        session_id: sessionId,
        kind,
        after_turn: afterTurn,
        pending: 1,
        created_at: Date.now(),
      }),
    settle: (id) => records.update('markers', id, {pending: 0}),
    remove: (id) => records.remove('markers', id),
  }
}
