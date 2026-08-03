export type RunTracker = {
  track: (sessionId: string, run: Promise<void>) => Promise<void>
  settled: (sessionId: string) => Promise<void>
  drain: (timeoutMs: number) => Promise<number>
}

async function raceWithTimeout(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  const timer = {handle: null as ReturnType<typeof setTimeout> | null}
  await Promise.race([
    work,
    new Promise((resolve) => {
      timer.handle = setTimeout(resolve, timeoutMs)
    }),
  ])
  if (timer.handle) clearTimeout(timer.handle)
}

export function createRunTracker(): RunTracker {
  const inFlight = new Set<Promise<void>>()
  const bySession = new Map<string, Promise<void>>()
  return {
    track: (sessionId, run) => {
      const settled = run.catch(() => {})
      inFlight.add(settled)
      bySession.set(sessionId, settled)
      return settled.finally(() => {
        inFlight.delete(settled)
        if (bySession.get(sessionId) === settled) bySession.delete(sessionId)
      })
    },
    settled: (sessionId) => bySession.get(sessionId) ?? Promise.resolve(),
    drain: async (timeoutMs) => {
      const pending = [...inFlight]
      if (pending.length === 0) return 0
      const outstanding = new Set(pending)
      for (const run of pending) void run.then(() => outstanding.delete(run))
      await raceWithTimeout(Promise.all(pending), timeoutMs)
      return outstanding.size
    },
  }
}
