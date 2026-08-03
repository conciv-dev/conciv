import {releaseRun} from '@conciv/db'
import type {ChatDeps} from './runtime.js'

export function stopSession(deps: ChatDeps, sessionId: string): {ok: true} {
  const turn = deps.turns.active(sessionId)
  deps.asks.cancel(sessionId)
  if (!turn) return {ok: true}
  turn.abort.abort()
  if (turn.phase !== 'awaiting-approval') return {ok: true}
  releaseRun(deps.db, sessionId, null)
  deps.turns.release(sessionId)
  return {ok: true}
}
