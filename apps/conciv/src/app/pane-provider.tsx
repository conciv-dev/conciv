import {createSignal, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import type {Grab} from '@conciv/grab'
import {useApp} from './context.js'
import {PaneContext, type PaneContextValue, type StagedGrab} from './pane-context.js'

export function PaneProvider(props: {sessionId: string; children: JSX.Element}): JSX.Element {
  const app = useApp()
  const sessions = useQuery(() => app.data.utils.sessions.list.queryOptions())
  const running = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)?.running ?? false

  const [grabs, setGrabs] = createSignal<StagedGrab[]>([])
  const value: PaneContextValue = {
    sessionId: () => props.sessionId,
    running,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    grabStore: {
      grabs,
      stage: (grab: Grab) => setGrabs((prev) => [...prev, grab]),
      stageTexts: (texts: string[]) => setGrabs(texts.map((text) => ({text}))),
      remove: (grab: StagedGrab) => setGrabs((prev) => prev.filter((entry) => entry !== grab)),
      clear: () => setGrabs([]),
    },
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
