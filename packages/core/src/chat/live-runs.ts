export type LiveRun = {runId: string; abort: AbortController; done: Promise<void>}
import type {SessionId} from '@conciv/protocol/chat-types'

export type LiveRuns = {
  start: (sessionId: SessionId, run: LiveRun) => void
  settle: (sessionId: SessionId, runId: string) => void
  of: (sessionId: SessionId) => LiveRun[]
  running: (sessionId: SessionId) => boolean
  onStart: (sessionId: SessionId, listener: (runId: string) => void) => () => void
  serialize: <T>(sessionId: SessionId, section: () => Promise<T>) => Promise<T>
}

export function createLiveRuns(): LiveRuns {
  const bySession = new Map<string, Set<LiveRun>>()
  const listeners = new Map<string, Set<(runId: string) => void>>()
  const tails = new Map<string, Promise<void>>()
  const remove = (sessionId: SessionId, run: LiveRun): void => {
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
    serialize: (sessionId, section) => {
      const entered = (tails.get(sessionId) ?? Promise.resolve()).then(section)
      const released = entered.then(
        () => undefined,
        () => undefined,
      )
      tails.set(sessionId, released)
      void released.then(() => {
        if (tails.get(sessionId) === released) tails.delete(sessionId)
      })
      return entered
    },
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
