import {createMemo, createSignal, type Accessor} from 'solid-js'

export type LiveSessions = {
  anyRunning: Accessor<boolean>
  register: (running: Accessor<boolean>) => () => void
}

type RegisteredPane = {working: Accessor<boolean>}

export function makeLiveSessions(): LiveSessions {
  const [panes, setPanes] = createSignal<RegisteredPane[]>([])
  const anyRunning = createMemo(() => panes().some((pane) => pane.working()))
  return {
    anyRunning,
    register(running) {
      const pane: RegisteredPane = {working: running}
      setPanes((prev) => [...prev, pane])
      return () => setPanes((prev) => prev.filter((entry) => entry !== pane))
    },
  }
}
