import type {ChatDeps} from './runtime.js'

export async function stopSession(deps: ChatDeps, sessionId: string): Promise<{ok: true}> {
  deps.asks.cancel(sessionId)
  const live = deps.liveRuns.of(sessionId)
  for (const run of live) run.abort.abort()
  await Promise.all(live.map((run) => run.done))
  return {ok: true}
}
