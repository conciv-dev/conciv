import type {RunRecord, RunStatus} from '@tanstack/ai'
import {aguiRunLifecycleFor, type RunLifecycle, type RunPhase} from '@conciv/protocol/run-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import {latestRunLifecycleFor, recordRunLifecycle} from '@conciv/db'
import type {ChatDeps} from './runtime.js'

const PHASE_BY_STATUS: Record<RunStatus, RunPhase> = {
  running: 'running',
  interrupted: 'running',
  completed: 'completed',
  failed: 'failed',
  aborted: 'aborted',
}

export function runPhaseOf(record: RunRecord): RunPhase {
  if (record.status === 'running' && record.cancelRequested === true) return 'stopping'
  return PHASE_BY_STATUS[record.status]
}

export function runLifecycleOfRecord(record: RunRecord, now: number): RunLifecycle {
  return {
    runId: record.runId,
    phase: runPhaseOf(record),
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? null,
    serverNow: now,
    error: record.error?.message ?? null,
  }
}

export function publishRunLifecycle(deps: ChatDeps, sessionId: SessionId, record: RunRecord): void {
  const lifecycle = runLifecycleOfRecord(record, Date.now())
  recordRunLifecycle(deps.db, sessionId, lifecycle)
  deps.stream.publish(sessionId, aguiRunLifecycleFor(lifecycle))
}

export async function publishRunRecord(deps: ChatDeps, sessionId: SessionId, runId: string): Promise<void> {
  const record = await deps.runs.get(runId)
  if (!record) return
  publishRunLifecycle(deps, sessionId, record)
}

async function latestRunRecord(deps: ChatDeps, sessionId: SessionId): Promise<RunRecord | null> {
  if (!deps.runs.listByThread) return deps.runs.findActiveRun(sessionId)
  const records = await deps.runs.listByThread(sessionId)
  return records.at(-1) ?? null
}

export async function latestRunLifecycle(deps: ChatDeps, sessionId: SessionId): Promise<RunLifecycle | null> {
  const record = await latestRunRecord(deps, sessionId)
  if (record) return runLifecycleOfRecord(record, Date.now())
  return latestRunLifecycleFor(deps.db, sessionId)
}
