import type {JSX} from 'solid-js'
import {useRouter} from '@tanstack/solid-router'
import {useAnnounce, useAppData, useAppQueryClient, useGrabProvider, useLiveSessions, usePaneChat} from './context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from './pane-context.js'
import {makePaneGrabApi} from '../pane/pane-grab.js'
import {PaneGrabBinding} from '../pane/plugin-session-parts.js'
import {makeRefreshCoordinator} from '../pane/refresh-coordinator.js'
import {useStartSession} from './start-session.js'
import {useGrabStaging} from './use-grab-staging.js'

export function PaneProvider(props: {
  sessionId: string
  onNewSession?: () => void
  onReplaceSession?: (sessionId: string) => void
  children: JSX.Element
}): JSX.Element {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const router = useRouter()
  const grabProvider = useGrabProvider()

  const startSession = useStartSession()

  const openNewSession = () =>
    startSession()
      .then(({sessionId}) => router.navigate({to: '/panel/$sessionId', params: {sessionId}}))
      .catch(() => undefined)

  const chat = usePaneChat(() => props.sessionId)
  const coordinator = makeRefreshCoordinator({
    chat,
    liveSessions: useLiveSessions(),
    sessionId: () => props.sessionId,
    appData,
    queryClient,
    announce,
  })

  const value: PaneContextValue = {
    slideClass: () => '',
    resetSlide: () => {},
    grabStaging: useGrabStaging(),
    grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => {
      if (props.onNewSession) {
        props.onNewSession()
        return
      }
      void openNewSession()
    },
    replaceSession: (sessionId) => {
      if (props.onReplaceSession) {
        props.onReplaceSession(sessionId)
        return
      }
      void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
    },
    chat,
    refresh: coordinator.refresh,
    isRefreshing: coordinator.isRefreshing,
  }

  const paneGrab = makePaneGrabApi(value.grabStaging, grabProvider)

  return (
    <PaneContext.Provider value={value}>
      <PaneGrabBinding sessionId={props.sessionId} grab={paneGrab} />
      {props.children}
    </PaneContext.Provider>
  )
}
