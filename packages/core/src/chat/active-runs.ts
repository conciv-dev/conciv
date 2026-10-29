import type {RunRecord, RunStore} from '@tanstack/ai'
import type {SessionId} from '@conciv/protocol/chat-types'

export async function activeRunsOf(runs: RunStore, sessionId: SessionId): Promise<RunRecord[]> {
  const listed = await runs.listByThread?.(sessionId)
  if (listed) return listed.filter((record) => record.status === 'running')
  const active = await runs.findActiveRun(sessionId)
  return active ? [active] : []
}
