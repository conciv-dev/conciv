import {type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {useAppData, useGrabProvider} from './context.js'
import {PaneContext, makeGrabStore, makePendingAttachmentQueue, type PaneContextValue} from './pane-context.js'

export function PaneProvider(props: {sessionId: string; children: JSX.Element}): JSX.Element {
  const appData = useAppData()
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const row = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)
  const running = () => row()?.running ?? false
  const attached = () => row()?.attached ?? false
  const grabProvider = useGrabProvider()

  const value: PaneContextValue = {
    sessionId: () => props.sessionId,
    running,
    attached,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStore: makeGrabStore(),
    grabProvider,
    attachments: makePendingAttachmentQueue(),
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
