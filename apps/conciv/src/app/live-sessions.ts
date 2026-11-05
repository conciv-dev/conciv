import {createMemo, mapArray, onCleanup, untrack, type Accessor} from 'solid-js'
import type {QueryClient} from '@tanstack/solid-query'
import {createStore} from 'solid-js/store'
import {useChatSession, type ChatSession, type ChatTransportPreference} from '@conciv/client'
import {browserRpcConnection, type RpcClient} from '@conciv/contract'
import {isRunPhaseTerminal, type RunLifecycle} from '@conciv/protocol/chat-event-types'
import type {AppData} from '../data/app-data.js'
import {engineLocked} from './engine-login.js'

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

type RunWatch = {live: string | null; sent: boolean; settled: string | null}

const IDLE_RUN: RunWatch = {live: null, sent: false, settled: null}

export function makeLiveSessions(deps: LiveSessionsDeps): LiveSessions {
  const [state, setState] = createStore<{openers: Accessor<string>[]; runs: Record<string, RunWatch>}>({
    openers: [],
    runs: {},
  })
  const opened = createMemo(() => state.openers.map((sessionId) => sessionId()))
  const watched = createMemo(() =>
    Object.entries(state.runs).flatMap(([sessionId, run]) => (run.live !== null || run.sent ? [sessionId] : [])),
  )
  const sessionIds = createMemo(() => [...new Set([...opened(), ...watched()])])

  const runOf = (sessionId: string): RunWatch => state.runs[sessionId] ?? IDLE_RUN

  const markSent = (sessionId: string, sent: boolean) => setState('runs', sessionId, {...runOf(sessionId), sent})

  const start = (sessionId: string, lifecycle: RunLifecycle) => {
    const run = runOf(sessionId)
    if (lifecycle.runId === run.live || lifecycle.runId === run.settled) return
    setState('runs', sessionId, {live: lifecycle.runId, sent: false, settled: run.settled})
  }

  const finish = (sessionId: string, lifecycle: RunLifecycle) => {
    const run = runOf(sessionId)
    const ours = lifecycle.runId === run.live || run.sent
    if (lifecycle.runId === run.settled || !ours) return
    setState('runs', sessionId, {live: null, sent: lifecycle.runId === run.live && run.sent, settled: lifecycle.runId})
    deps.appData.invalidateSessions()
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.markers.list.key({input: {sessionId}})})
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.captures.list.key({input: {sessionId}})})
    if (lifecycle.phase === 'completed') deps.announce('conciv replied.')
  }

  const liveChat = (sessionId: string): LiveChat => {
    const chat = createMemo((): ChatSession => {
      deps.generation()
      const apiBase = deps.apiBase()
      const session = useChatSession({
        rpc: deps.rpc,
        apiBase,
        sessionId,
        connection: {
          transport: deps.transport(),
          onHydrated: (hydration) => {
            if (hydration.lastRun && !isRunPhaseTerminal(hydration.lastRun.phase)) start(sessionId, hydration.lastRun)
          },
          onLifecycle: (lifecycle) =>
            isRunPhaseTerminal(lifecycle.phase) ? finish(sessionId, lifecycle) : start(sessionId, lifecycle),
        },
      })
      const stopTrust = browserRpcConnection(apiBase).trust.subscribe((status, previous) => {
        if (status === 'trusted' && engineLocked(previous))
          session.refresh().catch((error: unknown) => console.error('[conciv] re-hydrating the chat failed', error))
      })
      onCleanup(() => {
        stopTrust()
        if (untrack(session.runInProgress)) deps.appData.invalidateSessions()
      })
      return {
        ...session,
        sendMessage: (...message) => {
          markSent(sessionId, true)
          return session.sendMessage(...message).catch((error: unknown) => {
            markSent(sessionId, false)
            throw error
          })
        },
      }
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
      setState('openers', (list) => [...list, sessionId])
      onCleanup(() => setState('openers', (list) => list.filter((entry) => entry !== sessionId)))
      return () => {
        const entry = chatOf(sessionId())
        if (!entry) throw new Error(`no live chat for session ${sessionId()}`)
        return entry.chat()
      }
    },
  }
}
