import {requestRunCancel, RUN_CANCEL_REASON} from '@tanstack/ai'
import type {ChatDeps} from './runtime.js'
import type {SessionId} from '@conciv/protocol/chat-types'
import {publishRunRecord} from './run-lifecycle.js'
import type {LiveRun} from './live-runs.js'

async function acknowledgeStop(deps: ChatDeps, sessionId: SessionId, run: LiveRun): Promise<void> {
  await requestRunCancel(deps.runs, run.runId)
  await publishRunRecord(deps, sessionId, run.runId)
}

export async function stopSession(deps: ChatDeps, sessionId: SessionId): Promise<{ok: true}> {
  deps.asks.cancel(sessionId)
  const live = deps.liveRuns.of(sessionId)
  await Promise.all(live.map((run) => acknowledgeStop(deps, sessionId, run).catch(() => {})))
  for (const run of live) run.abort.abort(RUN_CANCEL_REASON)
  await Promise.all(live.map((run) => run.done))
  return {ok: true}
}
