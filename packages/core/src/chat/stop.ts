import type {ChatDeps} from './runtime.js'
import type {SessionId} from '@conciv/protocol/chat-types'

export async function stopSession(deps: ChatDeps, sessionId: SessionId): Promise<{ok: true}> {
  deps.asks.cancel(sessionId)
  const live = deps.liveRuns.of(sessionId)
  for (const run of live) run.abort.abort()
  await Promise.all(live.map((run) => run.done))
  return {ok: true}
}
