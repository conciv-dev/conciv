import {createEffect, createMemo, createRoot, on, onCleanup, untrack, type Accessor} from 'solid-js'
import {difference, partition, uniq} from 'es-toolkit'
import {useQuery, type QueryClient} from '@tanstack/solid-query'
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

type LiveChat = {sessionId: string; chat: Accessor<ChatSession>; dispose: () => void}

type RunWatch = {live: string | null; settled: string | null}

const IDLE_RUN: RunWatch = {live: null, settled: null}

function clientWorking(chat: ChatSession): boolean {
  const status = chat.status()
  if (status === 'submitted' || status === 'streaming') return true
  return status === 'ready' && untrack(chat.queue).length > 0
}

export function makeLiveSessions(deps: LiveSessionsDeps): LiveSessions {
  const [state, setState] = createStore<{openers: Accessor<string>[]; runs: Record<string, RunWatch>}>({
    openers: [],
    runs: {},
  })
  const opened = createMemo(() => state.openers.map((sessionId) => sessionId()))
  const watched = createMemo(() =>
    Object.entries(state.runs).flatMap(([sessionId, run]) => (run.live === null ? [] : [sessionId])),
  )
  const wanted = createMemo(() => uniq([...opened(), ...watched()]))

  const runOf = (sessionId: string): RunWatch => state.runs[sessionId] ?? IDLE_RUN

  const start = (sessionId: string, lifecycle: RunLifecycle) => {
    const run = runOf(sessionId)
    if (lifecycle.runId === run.live || lifecycle.runId === run.settled) return
    setState('runs', sessionId, {live: lifecycle.runId, settled: run.settled})
  }

  const finish = (sessionId: string, lifecycle: RunLifecycle, sentHere: boolean) => {
    const run = runOf(sessionId)
    if (lifecycle.runId === run.settled || !(lifecycle.runId === run.live || sentHere)) return
    setState('runs', sessionId, {live: null, settled: lifecycle.runId})
    deps.appData.invalidateSessions()
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.markers.list.key({input: {sessionId}})})
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.captures.list.key({input: {sessionId}})})
    if (lifecycle.phase === 'completed') deps.announce('conciv replied.')
  }

  const hydrated = (sessionId: string, lastRun: RunLifecycle | null) => {
    if (lastRun === null) return
    if (!isRunPhaseTerminal(lastRun.phase)) return start(sessionId, lastRun)
    if (lastRun.runId === runOf(sessionId).live) finish(sessionId, lastRun, false)
  }

  const liveChat = (sessionId: string, dispose: () => void): LiveChat => {
    const chat = createMemo((): ChatSession => {
      deps.generation()
      const apiBase = deps.apiBase()
      const session = useChatSession({
        rpc: deps.rpc,
        apiBase,
        sessionId,
        connection: {
          transport: deps.transport(),
          onHydrated: (hydration) => hydrated(sessionId, hydration.lastRun),
          onLifecycle: (lifecycle) =>
            isRunPhaseTerminal(lifecycle.phase)
              ? finish(
                  sessionId,
                  lifecycle,
                  untrack(() => clientWorking(session)),
                )
              : start(sessionId, lifecycle),
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
      return session
    })
    return {sessionId, chat, dispose}
  }

  const sessionChanges = useQuery(
    () => ({
      ...deps.appData.utils.sessions.changes.experimental_liveOptions(),
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
      retry: true,
    }),
    () => deps.queryClient,
  )
  createEffect(
    on(
      () => sessionChanges.dataUpdatedAt,
      () => deps.appData.invalidateSessions(),
      {defer: true},
    ),
  )

  const chats = createMemo<LiveChat[]>((previous) => {
    const ids = wanted()
    const [kept, dropped] = partition(previous, (entry) => ids.includes(entry.sessionId) || clientWorking(entry.chat()))
    for (const entry of dropped) entry.dispose()
    const added = difference(
      ids,
      kept.map((entry) => entry.sessionId),
    ).map((sessionId) => createRoot((dispose) => liveChat(sessionId, dispose)))
    return [...kept, ...added]
  }, [])
  onCleanup(() => {
    for (const entry of untrack(chats)) entry.dispose()
  })
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
