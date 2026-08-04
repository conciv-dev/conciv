import {type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {useRouter} from '@tanstack/solid-router'
import {useAppData, useGrabProvider, useRpc} from './context.js'
import {PaneContext, makeGrabStore, makePendingAttachmentQueue, type PaneContextValue} from './pane-context.js'

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

  const value: PaneContextValue = {
    sessionId: () => props.sessionId,
    running,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStore: makeGrabStore(),
    grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => {
      if (props.onNewSession) {
        props.onNewSession()
        return
      }
      void openNewSession()
    },
  }

  return <PaneContext.Provider value={value}>{props.children}</PaneContext.Provider>
}
