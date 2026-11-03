import {createMemo, createSignal, mapArray, onCleanup, untrack, type Accessor} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import {useChatSession, type ChatSession, type ChatTransportPreference} from '@conciv/client'
import type {RpcClient} from '@conciv/contract'
import {isRunPhaseTerminal, type RunLifecycle} from '@conciv/protocol/chat-event-types'
import type {AppData} from '../data/app-data.js'

export type PaneActivity = 'unmounted' | 'idle' | 'running'

export type LiveSessions = {
  activityIn: (sessionId: string | null) => PaneActivity
  open: (sessionId: Accessor<string>) => Accessor<ChatSession>
}

export type LiveSessionsDeps = {
  rpc: RpcClient
  apiBase: Accessor<string>
  generation: Accessor<number>
  transport: Accessor<ChatTransportPreference | undefined>
  appData: AppData
  queryClient: QueryClient
  announce: (message: string) => void
}

type LiveChat = {sessionId: string; chat: Accessor<ChatSession>}

export function makeLiveSessions(deps: LiveSessionsDeps): LiveSessions {
  const [openers, setOpeners] = createSignal<Accessor<string>[]>([])
  const [running, setRunning] = createSignal<string[]>([])
  const opened = createMemo(() => openers().map((sessionId) => sessionId()))
  const sessionIds = createMemo(() => [...new Set([...opened(), ...running()])])

  const noteRun = (sessionId: string, lifecycle: RunLifecycle | null) => {
    const active = lifecycle !== null && !isRunPhaseTerminal(lifecycle.phase)
    setRunning((ids) => (active ? [...new Set([...ids, sessionId])] : ids.filter((id) => id !== sessionId)))
  }

  const settle = (sessionId: string, lifecycle: RunLifecycle) => {
    deps.appData.invalidateSessions()
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.markers.list.key({input: {sessionId}})})
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.captures.list.key({input: {sessionId}})})
    if (lifecycle.phase === 'completed') deps.announce('conciv replied.')
  }

  const liveChat = (sessionId: string): LiveChat => {
    const chat = createMemo(() => {
      deps.generation()
      const session = useChatSession({
        rpc: deps.rpc,
        apiBase: deps.apiBase(),
        sessionId,
        connection: {
          transport: deps.transport(),
          onHydrated: (hydration) => noteRun(sessionId, hydration.lastRun),
          onLifecycle: (lifecycle) => {
            if (isRunPhaseTerminal(lifecycle.phase)) settle(sessionId, lifecycle)
            noteRun(sessionId, lifecycle)
          },
        },
      })
      onCleanup(() => {
        if (untrack(session.runInProgress)) deps.appData.invalidateSessions()
      })
      return session
    })
    return {sessionId, chat}
  }

  const chats = createMemo(mapArray(sessionIds, liveChat))
  const chatOf = (sessionId: string | null) => chats().find((entry) => entry.sessionId === sessionId)

  return {
    activityIn(sessionId) {
      const entry = chatOf(sessionId)
      if (!entry) return 'unmounted'
      return entry.chat().runInProgress() ? 'running' : 'idle'
    },
    open(sessionId) {
      setOpeners((list) => [...list, sessionId])
      onCleanup(() => setOpeners((list) => list.filter((entry) => entry !== sessionId)))
      return () => {
        const entry = chatOf(sessionId())
        if (!entry) throw new Error(`no live chat for session ${sessionId()}`)
        return entry.chat()
      }
    },
  }
}
