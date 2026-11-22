const HANG_GUARD_MS = 5000
const INTERVAL_MS = 10

export async function until(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = performance.now() + HANG_GUARD_MS
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error(`until: stall - condition not met within ${HANG_GUARD_MS}ms`)
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
  }
}
