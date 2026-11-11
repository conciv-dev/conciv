import type {JSX} from 'solid-js'
import {useQuery} from '@conciv/client'
import {useRouter} from '@tanstack/solid-router'
import {
  useAnnounce,
  useAppData,
  useAppQueryClient,
  useGrabProvider,
  useChatDeps,
  useLiveSessions,
  usePaneChat,
} from './context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from './pane-context.js'
import {makeGrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'
import {makeRefreshCoordinator} from '../pane/refresh-coordinator.js'

export function PaneProvider(props: {
  sessionId: string
  onNewSession?: () => void
  children: JSX.Element
}): JSX.Element {
  const appData = useAppData()
  const {rpc} = useChatDeps()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const router = useRouter()
  const session = useQuery(() => appData.utils.sessions.get.queryOptions({input: {sessionId: props.sessionId}}))
  const running = () => session.data?.running ?? false
  const grabProvider = useGrabProvider()

  const openNewSession = async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    void appData.invalidateSession(sessionId)
    void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
  }

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
    sessionId: () => props.sessionId,
    running,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStaging: makeGrabStaging({ground: (grab) => resolveGrabSource(grab, (input) => rpc.page.symbolicate(input))}),
    grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => {
      if (props.onNewSession) {
        props.onNewSession()
        return
      }
      void openNewSession()
    },
    chat,
    refresh: coordinator.refresh,
    isRefreshing: coordinator.isRefreshing,
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
