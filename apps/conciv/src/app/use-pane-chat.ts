import {createMemo, type Accessor} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import {useChatSession, type ChatSession, type ChatTransportPreference} from '@conciv/client'
import type {RpcClient} from '@conciv/contract'
import type {AppData} from '../data/app-data.js'
import {trackSessionActivity} from '../pane/session-activity.js'
import type {LiveSessions} from './live-sessions.js'
import {
  useAnnounce,
  useAppData,
  useAppQueryClient,
  useChatDeps,
  useConnectionGeneration,
  useLiveSessions,
  useSettings,
} from './context.js'

export type PaneChatDeps = {
  rpc: RpcClient
  apiBase: Accessor<string>
  sessionId: Accessor<string>
  generation: Accessor<number>
  transport: Accessor<ChatTransportPreference | undefined>
  liveSessions: LiveSessions
  appData: AppData
  queryClient: QueryClient
  announce: (message: string) => void
}

export function makePaneChat(deps: PaneChatDeps): Accessor<ChatSession> {
  const chatKey = createMemo(() => ({sessionId: deps.sessionId(), generation: deps.generation()}))
  return createMemo(() => {
    const sessionId = chatKey().sessionId
    const chat = useChatSession({
      rpc: deps.rpc,
      apiBase: deps.apiBase(),
      sessionId,
      connection: {transport: deps.transport()},
    })
    trackSessionActivity({
      sessionId,
      active: chat.runInProgress,
      liveSessions: deps.liveSessions,
      invalidateSessions: deps.appData.invalidateSessions,
      onSettle: () => {
        deps.appData.invalidateSessions()
        void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.markers.list.key({input: {sessionId}})})
        void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.captures.list.key({input: {sessionId}})})
        if (!chat.error()) deps.announce('conciv replied.')
      },
    })
    return chat
  })
}

export function usePaneChat(sessionId: Accessor<string>): Accessor<ChatSession> {
  const {rpc, apiBase} = useChatDeps()
  const settings = useSettings()
  return makePaneChat({
    rpc,
    apiBase,
    sessionId,
    generation: useConnectionGeneration(),
    transport: () => settings.transport,
    liveSessions: useLiveSessions(),
    appData: useAppData(),
    queryClient: useAppQueryClient(),
    announce: useAnnounce(),
  })
}
