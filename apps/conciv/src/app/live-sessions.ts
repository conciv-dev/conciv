import {createSignal, type Accessor} from 'solid-js'

export type LiveSessions = {
  anyRunning: Accessor<boolean>
  setRunning: (sessionId: string, running: boolean) => void
}

function withoutOne(ids: readonly string[], sessionId: string): readonly string[] {
  const index = ids.indexOf(sessionId)
  if (index < 0) return ids
  return [...ids.slice(0, index), ...ids.slice(index + 1)]
}

export function makeLiveSessions(): LiveSessions {
  const [ids, setIds] = createSignal<readonly string[]>([])
  return {
    anyRunning: () => ids().length > 0,
    setRunning: (sessionId, running) =>
      setIds((prev) => (running ? [...prev, sessionId] : withoutOne(prev, sessionId))),
  }
}
