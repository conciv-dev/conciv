export type LiveRun = {runId: string; abort: AbortController; done: Promise<void>}

export type LiveRuns = {
  start: (sessionId: string, run: LiveRun) => void
  settle: (sessionId: string, runId: string) => void
  of: (sessionId: string) => LiveRun[]
  running: (sessionId: string) => boolean
  onStart: (sessionId: string, listener: (runId: string) => void) => () => void
}

export function createLiveRuns(): LiveRuns {
  const bySession = new Map<string, Set<LiveRun>>()
  const listeners = new Map<string, Set<(runId: string) => void>>()
  const remove = (sessionId: string, run: LiveRun): void => {
    const runs = bySession.get(sessionId)
    if (!runs) return
    runs.delete(run)
    if (runs.size === 0) bySession.delete(sessionId)
  }
  return {
    start: (sessionId, run) => {
      const runs = bySession.get(sessionId) ?? new Set()
      bySession.set(sessionId, runs)
      runs.add(run)
      void run.done.finally(() => remove(sessionId, run))
      for (const listener of listeners.get(sessionId) ?? []) listener(run.runId)
    },
    settle: (sessionId, runId) => {
      for (const run of bySession.get(sessionId) ?? []) {
        if (run.runId === runId) remove(sessionId, run)
      }
    },
    of: (sessionId) => [...(bySession.get(sessionId) ?? [])],
    running: (sessionId) => (bySession.get(sessionId)?.size ?? 0) > 0,
    onStart: (sessionId, listener) => {
      const registered = listeners.get(sessionId) ?? new Set()
      listeners.set(sessionId, registered)
      registered.add(listener)
      return () => {
        registered.delete(listener)
        if (registered.size === 0 && listeners.get(sessionId) === registered) listeners.delete(sessionId)
      }
    },
  }
}
