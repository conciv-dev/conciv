import {requestRunCancel, RUN_CANCEL_REASON, type RunRecord} from '@tanstack/ai'
import type {ChatDeps} from './runtime.js'
import type {SessionId} from '@conciv/protocol/chat-types'
import {publishRunRecord} from './run-lifecycle.js'
import type {RunDriver} from './run-drivers.js'
import {activeRunsOf} from './active-runs.js'

async function acknowledgeStop(deps: ChatDeps, sessionId: SessionId, runId: string): Promise<void> {
  await requestRunCancel(deps.runs, runId)
  await publishRunRecord(deps, sessionId, runId)
}

export async function stopRuns(deps: ChatDeps, sessionId: SessionId, records: readonly RunRecord[]): Promise<void> {
  if (records.length === 0) return
  await Promise.all(records.map((record) => acknowledgeStop(deps, sessionId, record.runId).catch(() => {})))
  const drivers = records.flatMap((record): RunDriver[] => {
    const driver = deps.runDrivers.driverOf(record.runId)
    return driver ? [driver] : []
  })
  for (const driver of drivers) driver.abort.abort(RUN_CANCEL_REASON)
  await Promise.all(drivers.map((driver) => driver.settled))
}

export async function stopSession(deps: ChatDeps, sessionId: SessionId): Promise<{ok: true}> {
  deps.asks.cancel(sessionId)
  await stopRuns(deps, sessionId, await activeRunsOf(deps.runs, sessionId))
  return {ok: true}
}
