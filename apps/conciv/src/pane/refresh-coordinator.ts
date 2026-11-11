import {createSignal, type Accessor} from 'solid-js'
import type {QueryClient, QueryKey, ChatSession} from '@conciv/client'
import type {AppData} from '../data/app-data.js'
import type {LiveSessions} from '../app/live-sessions.js'

export type RefreshCoordinator = {
  refresh: () => void
  isRefreshing: Accessor<boolean>
}

export type RefreshCoordinatorDeps = {
  chat: Accessor<ChatSession>
  liveSessions: LiveSessions
  sessionId: Accessor<string>
  appData: AppData
  queryClient: QueryClient
  announce: (message: string, assertive?: boolean) => void
}

type RefreshPhase = 'idle' | 'running'

export function makeRefreshCoordinator(deps: RefreshCoordinatorDeps): RefreshCoordinator {
  const [phase, setPhase] = createSignal<RefreshPhase>('idle')

  const sessionQueryKeys = (): QueryKey[] => [
    deps.appData.utils.sessions.list.key(),
    deps.appData.utils.sessions.search.key(),
    deps.appData.utils.sessions.get.key({input: {sessionId: deps.sessionId()}}),
    deps.appData.utils.markers.list.key({input: {sessionId: deps.sessionId()}}),
    deps.appData.utils.captures.list.key({input: {sessionId: deps.sessionId()}}),
  ]

  const run = async (): Promise<void> => {
    setPhase('running')
    deps.announce('Refreshing the conversation…')
    try {
      await Promise.all([
        deps.chat().refresh(),
        ...sessionQueryKeys().map((queryKey) => deps.queryClient.refetchQueries({queryKey})),
      ])
      deps.announce('Conversation refreshed.')
    } catch {
      deps.announce('conciv could not refresh the conversation. Try again.', true)
    } finally {
      setPhase('idle')
    }
  }

  return {
    refresh: () => {
      if (phase() === 'running') return
      if (!deps.chat().loadFailed()) return void run()
      deps.announce('Refreshing the conversation…')
      deps.liveSessions.reopen(deps.sessionId())
    },
    isRefreshing: () => phase() === 'running',
  }
}
