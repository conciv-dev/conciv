import {createMemo, createSignal, type Accessor} from 'solid-js'

export type LiveSessions = {
  anyRunning: Accessor<boolean>
  register: (running: Accessor<boolean>) => () => void
}

export function makeLiveSessions(): LiveSessions {
  const [panes, setPanes] = createSignal<Accessor<boolean>[]>([])
  const anyRunning = createMemo(() => panes().some((running) => running()))
  return {
    anyRunning,
    register(running) {
      setPanes((prev) => [...prev, running])
      return () => setPanes((prev) => prev.filter((entry) => entry !== running))
    },
  }
}
