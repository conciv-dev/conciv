import {createMemo, createRoot, on, onCleanup, untrack, type Accessor} from 'solid-js'
import {difference, partition, uniq} from 'es-toolkit'
import {type QueryClient, useChatSession, type ChatSession} from '@conciv/client'
import {createStore, unwrap} from 'solid-js/store'
import {browserRpcConnection, type RpcClient} from '@conciv/client'
import {isRunPhaseTerminal, type RunLifecycle} from '@conciv/types/chat-event-types'
import type {QueuedMessage} from '@conciv/types/chat-message-types'
import type {AppData} from '../data/app-data.js'
import {putBackInDraft, returnQueueToDraft, type DraftSink, type QueueOwner} from '../pane/pane-attachments.js'
import {
  appendDraft,
  draftCacheSink,
  makeDraftWriteChain,
  prependDraft,
  type DraftWriteChain,
} from '../pane/draft-storage.js'
import {becameTrusted} from './engine-login.js'
import type {Notify} from '../shell/notices.js'
import type {ConcivTimings} from '../router.js'

export type PaneActivity = 'unmounted' | 'idle' | 'running'

export type PaneDraftSinks = {queue: DraftSink; steered: DraftSink}

export type LiveSessions = {
  activityIn: (sessionId: string | null) => PaneActivity
  runLive: (sessionId: string) => boolean
  waitingIn: (sessionId: string | null) => boolean
  open: (sessionId: Accessor<string>) => Accessor<ChatSession>
  reopen: (sessionId: string) => void
  stop: (sessionId: string) => void
  receiveDraftReturns: (sessionId: string, sinks: PaneDraftSinks) => void
  returnSteered: (sessionId: string, owner: QueueOwner, item: QueuedMessage) => void
  keepDraft: DraftWriteChain
}

export type LiveSessionsDeps = {
  active: Accessor<string | null>
  rpc: RpcClient
  apiBase: Accessor<string>
  generation: Accessor<number>
  appData: AppData
  queryClient: QueryClient
  announce: (message: string) => void
  notify: Notify
  timings?: ConcivTimings
}

const DRAFT_RETURN_FAILED = 'The queued message could not be put back in its draft.'

type LiveChat = {sessionId: string; chat: Accessor<ChatSession>; dispose: () => void}

type RunWatch = {live: string | null; settled: string | null}

const IDLE_RUN: RunWatch = {live: null, settled: null}

function clientWorking(chat: ChatSession): boolean {
  const status = chat.status()
  if (status === 'submitted' || status === 'streaming') return true
  return status === 'ready' && untrack(chat.queue).length > 0
}

export function makeLiveSessions(deps: LiveSessionsDeps): LiveSessions {
  const keepDraft = makeDraftWriteChain()
  const notifyReturnFailed = () => deps.notify(DRAFT_RETURN_FAILED, {tone: 'danger'})
  const [state, setState] = createStore<{
    openers: Accessor<string>[]
    runs: Record<string, RunWatch>
    retired: Record<string, ChatSession>
    paneDraftSinks: Partial<Record<string, PaneDraftSinks>>
  }>({
    openers: [],
    runs: {},
    retired: {},
    paneDraftSinks: {},
  })
  const opened = createMemo(() => state.openers.map((sessionId) => sessionId()))
  const watched = createMemo(() =>
    Object.entries(state.runs).flatMap(([sessionId, run]) => (run.live === null ? [] : [sessionId])),
  )
  const wanted = createMemo(() => {
    const active = deps.active()
    return uniq([...opened(), ...watched(), ...(active === null ? [] : [active])])
  })

  const readRun = (sessionId: string): RunWatch => state.runs[sessionId] ?? IDLE_RUN

  const retire = (sessionId: string, chat: ChatSession): void => setState('retired', {[sessionId]: chat})

  const start = (sessionId: string, lifecycle: RunLifecycle) => {
    const run = readRun(sessionId)
    if (lifecycle.runId === run.live || lifecycle.runId === run.settled) return
    setState('runs', sessionId, {live: lifecycle.runId, settled: run.settled})
  }

  const finish = (sessionId: string, lifecycle: RunLifecycle, sentHere: boolean) => {
    const run = readRun(sessionId)
    if (lifecycle.runId === run.settled || !(lifecycle.runId === run.live || sentHere)) return
    setState('runs', sessionId, {live: null, settled: lifecycle.runId})
    void deps.appData.invalidateSession(sessionId)
    void deps.queryClient.invalidateQueries({queryKey: deps.appData.utils.markers.list.key({input: {sessionId}})})
    if (lifecycle.phase === 'completed') deps.announce('conciv replied.')
  }

  const hydrated = (sessionId: string, lastRun: RunLifecycle | null) => {
    if (lastRun === null) return
    if (!isRunPhaseTerminal(lastRun.phase)) return start(sessionId, lastRun)
    if (lastRun.runId === readRun(sessionId).live) finish(sessionId, lastRun, false)
  }

  const returnLostQueue = (sessionId: string, session: ChatSession): void => {
    returnQueueToDraft(
      session,
      state.paneDraftSinks[sessionId]?.queue ??
        draftCacheSink(keepDraft, deps.appData, sessionId, appendDraft, notifyReturnFailed),
    )
  }

  const liveChat = (sessionId: string, dispose: () => void): LiveChat => {
    const chat = createMemo(
      on([deps.generation, deps.apiBase, () => state.retired[sessionId]], ([, apiBase, retired]) =>
        openChat(sessionId, apiBase, retired !== undefined),
      ),
    )
    return {sessionId, chat, dispose}
  }

  const openChat = (sessionId: string, apiBase: string, reopened: boolean): ChatSession => {
    const session = useChatSession({
      rpc: deps.rpc,
      apiBase,
      sessionId,
      onError: () => {
        if (reopened && session.loadFailed()) deps.announce('conciv could not load this conversation. Try again.')
        returnLostQueue(sessionId, session)
      },
      connection: {
        runReconnect: deps.timings?.chatRunReconnect,
        engineTimings: deps.timings?.engine,
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
    const connection = browserRpcConnection(apiBase, undefined, deps.timings?.engine)
    const stopTrust = connection.trust.subscribe((status, previous) => {
      if (!becameTrusted(status, previous)) return
      if (session.loadFailed()) return retire(sessionId, session)
      session.refresh().catch((error: unknown) => console.error('[conciv] re-hydrating the chat failed', error))
    })
    onCleanup(() => {
      stopTrust()
      connection.release()
      if (untrack(session.runInProgress)) void deps.appData.invalidateSession(sessionId)
    })
    return session
  }

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
  const findChat = (sessionId: string | null) => chats().find((entry) => entry.sessionId === sessionId)

  return {
    keepDraft,
    runLive: (sessionId) => readRun(sessionId).live !== null,
    activityIn(sessionId) {
      const entry = findChat(sessionId)
      if (!entry) return 'unmounted'
      return entry.chat().runInProgress() ? 'running' : 'idle'
    },
    waitingIn(sessionId) {
      return (findChat(sessionId)?.chat().pendingApprovals().length ?? 0) > 0
    },
    open(sessionId) {
      setState('openers', (list) => [...list, sessionId])
      onCleanup(() => setState('openers', (list) => list.filter((entry) => entry !== sessionId)))
      return () => {
        const entry = findChat(sessionId())
        if (!entry) throw new Error(`no live chat for session ${sessionId()}`)
        return entry.chat()
      }
    },
    reopen(sessionId) {
      const entry = findChat(sessionId)
      if (entry) retire(sessionId, entry.chat())
    },
    stop(sessionId) {
      void findChat(sessionId)?.chat().stop()
    },
    receiveDraftReturns(sessionId, sinks) {
      setState('paneDraftSinks', sessionId, () => sinks)
      onCleanup(() =>
        setState('paneDraftSinks', sessionId, (current: PaneDraftSinks | undefined) =>
          current !== undefined && unwrap(current) === sinks ? undefined : current,
        ),
      )
    },
    returnSteered(sessionId, owner, item) {
      if (owner.queue().some((queued) => queued.id === item.id)) return
      putBackInDraft(
        [item],
        state.paneDraftSinks[sessionId]?.steered ??
          draftCacheSink(keepDraft, deps.appData, sessionId, prependDraft, notifyReturnFailed),
      )
    },
  }
}
