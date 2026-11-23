import type {JSX} from 'solid-js'
import {useRouter} from '@tanstack/solid-router'
import {useAnnounce, useAppData, useAppQueryClient, useLiveSessions, usePaneChat} from './context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from './pane-context.js'
import {makeRefreshCoordinator} from '../pane/refresh-coordinator.js'
import {useStartSession} from './start-session.js'

export function PaneProvider(props: {
  sessionId: string
  onNewSession?: () => void
  onReplaceSession?: (sessionId: string) => Promise<void> | void
  children: JSX.Element
}): JSX.Element {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const router = useRouter()

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
    attachments: makePendingAttachmentQueue(),
    newSession: () => {
      if (props.onNewSession) {
        props.onNewSession()
        return
      }
      void openNewSession()
    },
    replaceSession: async (sessionId) => {
      if (props.onReplaceSession) return props.onReplaceSession(sessionId)
      await router.navigate({to: '/panel/$sessionId', params: {sessionId}})
    },
    chat,
    refresh: coordinator.refresh,
    isRefreshing: coordinator.isRefreshing,
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
