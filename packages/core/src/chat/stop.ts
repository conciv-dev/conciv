import {releaseRun} from '@conciv/db'
import type {ChatDeps} from './runtime.js'

export async function stopSession(deps: ChatDeps, sessionId: string): Promise<{ok: true}> {
  const turn = deps.turns.active(sessionId)
  deps.asks.cancel(sessionId)
  if (!turn) return {ok: true}
  turn.abort.abort()
  if (turn.phase === 'awaiting-approval') {
    releaseRun(deps.db, sessionId, null)
    deps.turns.release(sessionId)
    return {ok: true}
  }
  await deps.runs.settled(sessionId)
  return {ok: true}
}
