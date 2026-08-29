import type {RunStore} from '@tanstack/ai'

const SETTLE_POLL_MS = 20
const SETTLE_TIMEOUT_MS = 15_000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function awaitRunSettled(runs: RunStore, runId: string, timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const record = await runs.get(runId)
    if (!record || record.status !== 'running') return
    await delay(SETTLE_POLL_MS)
  }
}
