import {createSignal, type Accessor} from 'solid-js'

export type PaneActivity = 'unmounted' | 'idle' | 'running'

export type LiveSessions = {
  activityIn: (sessionId: string | null) => PaneActivity
  register: (sessionId: string, working: Accessor<boolean>) => () => void
}

type RegisteredPane = {sessionId: string; working: Accessor<boolean>}

export function makeLiveSessions(): LiveSessions {
  const [panes, setPanes] = createSignal<RegisteredPane[]>([])
  return {
    activityIn(sessionId) {
      if (sessionId === null) return 'unmounted'
      const mounted = panes().filter((pane) => pane.sessionId === sessionId)
      if (mounted.length === 0) return 'unmounted'
      return mounted.some((pane) => pane.working()) ? 'running' : 'idle'
    },
    register(sessionId, working) {
      const pane: RegisteredPane = {sessionId, working}
      setPanes((prev) => [...prev, pane])
      return () => setPanes((prev) => prev.filter((entry) => entry !== pane))
    },
  }
}
