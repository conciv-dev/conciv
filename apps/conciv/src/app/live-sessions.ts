import {createSignal, type Accessor} from 'solid-js'

export type LiveSessions = {
  anyRunning: Accessor<boolean>
  setRunning: (sessionId: string, running: boolean) => void
}

type RunCounts = ReadonlyMap<string, number>

function withDelta(counts: RunCounts, sessionId: string, delta: number): RunCounts {
  const running = counts.get(sessionId)
  if (running === undefined && delta < 0) return counts
  const next = new Map(counts)
  const count = (running ?? 0) + delta
  if (count <= 0) {
    next.delete(sessionId)
    return next
  }
  next.set(sessionId, count)
  return next
}

export function makeLiveSessions(): LiveSessions {
  const [counts, setCounts] = createSignal<RunCounts>(new Map())
  return {
    anyRunning: () => counts().size > 0,
    setRunning: (sessionId, running) => setCounts((prev) => withDelta(prev, sessionId, running ? 1 : -1)),
  }
}
