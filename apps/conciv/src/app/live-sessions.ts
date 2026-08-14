import {createSignal, type Accessor} from 'solid-js'

export type LiveSessions = {
  anyRunning: Accessor<boolean>
  setRunning: (sessionId: string, running: boolean) => void
}

function withoutSession(ids: readonly string[], sessionId: string): readonly string[] {
  return ids.filter((id) => id !== sessionId)
}

export function makeLiveSessions(): LiveSessions {
  const [ids, setIds] = createSignal<readonly string[]>([])
  return {
    anyRunning: () => ids().length > 0,
    setRunning: (sessionId, running) =>
      setIds((prev) => (running ? [...withoutSession(prev, sessionId), sessionId] : withoutSession(prev, sessionId))),
  }
}
