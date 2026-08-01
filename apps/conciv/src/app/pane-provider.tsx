import {createSignal, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import type {Grab} from '@conciv/grab'
import {useAppData, useGrabProvider} from './context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue, type StagedGrab} from './pane-context.js'

export function PaneProvider(props: {sessionId: string; children: JSX.Element}): JSX.Element {
  const appData = useAppData()
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const running = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)?.running ?? false
  const grabProvider = useGrabProvider()

  const [grabs, setGrabs] = createSignal<StagedGrab[]>([])
  const value: PaneContextValue = {
    sessionId: () => props.sessionId,
    running,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStore: {
      grabs,
      stage: (grab: Grab) => setGrabs((prev) => [...prev, grab]),
      stageTexts: (texts: string[]) => setGrabs(texts.map((text) => ({text}))),
      replace: (grab: StagedGrab, next: StagedGrab) =>
        setGrabs((prev) => prev.map((entry) => (entry === grab ? next : entry))),
      remove: (grab: StagedGrab) => setGrabs((prev) => prev.filter((entry) => entry !== grab)),
      clear: () => setGrabs([]),
    },
    grabProvider,
    attachments: makePendingAttachmentQueue(),
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
