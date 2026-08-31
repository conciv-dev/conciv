import type {RunStore} from '@tanstack/ai'

export async function reclaimAbandonedRuns(runs: RunStore, now: number): Promise<void> {
  const reclaimable = (await runs.listReclaimable?.({now, ttlMs: 0})) ?? []
  for (const record of reclaimable) await runs.update(record.runId, {status: 'aborted', finishedAt: now})
}
