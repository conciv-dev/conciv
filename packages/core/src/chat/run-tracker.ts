export type RunTracker = {
  track: (run: Promise<void>) => Promise<void>
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
  return {
    track: (run) => {
      const settled = run.catch(() => {})
      inFlight.add(settled)
      return settled.finally(() => {
        inFlight.delete(settled)
      })
    },
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
