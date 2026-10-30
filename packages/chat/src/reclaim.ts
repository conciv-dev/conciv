import type {RunStore} from '@conciv/ai/server'

export async function reclaimAbandonedRuns(runs: RunStore, now: number): Promise<void> {
  const reclaimable = (await runs.listReclaimable?.({now, ttlMs: 0})) ?? []
  for (const record of reclaimable) await runs.update(record.runId, {status: 'aborted', finishedAt: now})
}
