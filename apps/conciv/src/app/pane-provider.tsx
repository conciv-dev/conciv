import {createSignal, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {useRouter} from '@tanstack/solid-router'
import {useAppData, useGrabProvider, useRpc} from './context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue, type RefreshHandle} from './pane-context.js'
import {makeGrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'

export function PaneProvider(props: {
  sessionId: string
  onNewSession?: () => void
  children: JSX.Element
}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const router = useRouter()
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const row = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)
  const running = () => row()?.running ?? false
  const grabProvider = useGrabProvider()

  const openNewSession = async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    appData.invalidateSessions()
    void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
  }

  const [refreshHandle, setRefreshHandle] = createSignal<RefreshHandle | null>(null)

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
    refresh: refreshHandle,
    registerRefresh: (handle) => setRefreshHandle(handle),
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
