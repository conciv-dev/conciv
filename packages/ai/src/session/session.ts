import {StreamReconnectLimitError, type SubscribeConnectionAdapter} from '@tanstack/ai-client'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import {createMemo, createSignal, onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createScheduled, throttle} from '@solid-primitives/scheduled'
import {
  isRunPhaseTerminal,
  type ApprovalAsk,
  type RunClockSource,
  type RunLifecycle,
} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {chatBusy} from '@conciv/protocol/chat-busy'
import {CHAT_HISTORY_PAGE_SIZE, type PermissionReply} from '@conciv/protocol/chat-types'

export type Chat = UseChatReturn

const MESSAGES_FLUSH_MS = 16

export type CreateChatOptions = Parameters<typeof useChat>[0]

export type ChatSessionHydration = {
  messages: ChatMessage[]
  messageHarness: Record<string, string>
  lastRun: RunLifecycle | null
  pendingApprovals: readonly ApprovalAsk[]
  page?: {truncated: false} | {truncated: true; cursor: string}
}

export type ChatSessionConnection = SubscribeConnectionAdapter & {
  refresh: (before?: string) => Promise<ChatSessionHydration>
  close: () => void
}

export type ChatSessionCallbacks = {
  onLifecycle: (lifecycle: RunLifecycle) => void
  onHydrated: (hydration: ChatSessionHydration) => void
  onRunError: () => void
  onLive: () => void
  onApprovalAsk: (ask: ApprovalAsk) => void
  onApprovalSettled: (approvalId: string) => void
  joinsRun: (runId: string) => Promise<boolean>
}

export type CreateChatSessionOptions = {
  sessionId: string
  connect: (callbacks: ChatSessionCallbacks) => ChatSessionConnection
  stop: (runIds: string[]) => Promise<unknown>
  decide: (approvalId: string, reply: PermissionReply) => Promise<void>
  onError?: (error: Error) => void
}

export type ChatSession = Omit<Chat, 'stop' | 'error'> & {
  error: Accessor<Error | undefined>
  withdrawn: Accessor<boolean>
  stop: () => Promise<void>
  refresh: () => Promise<void>
  stopping: Accessor<boolean>
  stopped: Accessor<boolean>
  runSource: Accessor<RunClockSource | null>
  runError: Accessor<string | null>
  sessionRunning: Accessor<boolean>
  runInProgress: Accessor<boolean>
  loadFailed: Accessor<boolean>
  pendingApprovals: Accessor<ApprovalAsk[]>
  readHarness: (messageId: string) => string | undefined
  decide: (approvalId: string, reply: PermissionReply) => Promise<void>
}

function buildAsk({approvalId, toolCallId, toolName, input, permission}: ApprovalAsk): ApprovalAsk {
  const ask = {approvalId, toolCallId, toolName, input}
  return permission === undefined ? ask : {...ask, permission}
}

type CardArrival = {kind: 'ask'; ask: ApprovalAsk} | {kind: 'settle'; approvalId: string}

function withAsk(pending: ApprovalAsk[], ask: ApprovalAsk): ApprovalAsk[] {
  return pending.some((waiting) => waiting.approvalId === ask.approvalId) ? pending : [...pending, ask]
}

function withoutCard(pending: ApprovalAsk[], approvalId: string): ApprovalAsk[] {
  return pending.filter((waiting) => waiting.approvalId !== approvalId)
}

function arrived(pending: ApprovalAsk[], arrival: CardArrival): ApprovalAsk[] {
  return arrival.kind === 'ask' ? withAsk(pending, arrival.ask) : withoutCard(pending, arrival.approvalId)
}

function newerRun(current: RunClockSource | null, hydration: ChatSessionHydration): RunClockSource | null {
  const last = hydration.lastRun
  if (last === null) return current
  if (current !== null && current.lifecycle.startedAt > last.startedAt) return current
  if (settledAhead(current, last)) return current
  return {lifecycle: last, receivedAt: Date.now()}
}

function settledAhead(current: RunClockSource | null, last: RunLifecycle): boolean {
  if (current === null || current.lifecycle.runId !== last.runId) return false
  return isRunPhaseTerminal(current.lifecycle.phase) && !isRunPhaseTerminal(last.phase)
}

function stoppingRun(current: RunClockSource | null): RunClockSource | null {
  if (current === null || isRunPhaseTerminal(current.lifecycle.phase)) return current
  return {lifecycle: {...current.lifecycle, phase: 'stopping'}, receivedAt: Date.now()}
}

function runningHere(source: RunClockSource | null, runId: string): boolean {
  return source !== null && source.lifecycle.runId === runId && !isRunPhaseTerminal(source.lifecycle.phase)
}

function stoppedRun(current: RunClockSource | null): RunClockSource | null {
  if (current === null || isRunPhaseTerminal(current.lifecycle.phase)) return current
  const now = Date.now()
  return {
    lifecycle: {...current.lifecycle, phase: 'aborted', finishedAt: now, serverNow: now, error: null},
    receivedAt: now,
  }
}

type RunState =
  | {phase: 'known'; source: RunClockSource | null}
  | {phase: 'stop-queued'; source: RunClockSource | null; runId: string | null}
  | {phase: 'withdrawn'; source: RunClockSource | null; hidden: Error}

function heardRun(queued: string | null, next: RunClockSource | null): boolean {
  if (next === null) return false
  if (queued !== null && next.lifecycle.runId !== queued) return false
  return queued !== null || !isRunPhaseTerminal(next.lifecycle.phase)
}

function acknowledged(source: RunClockSource | null, localRunId: string | null): boolean {
  if (source === null) return false
  return !isRunPhaseTerminal(source.lifecycle.phase) || source.lifecycle.runId === localRunId
}

function beforeLastUser(messages: readonly ChatMessage[]): ChatMessage[] {
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  return lastUser === -1 ? [...messages] : messages.slice(0, lastUser)
}

function answered(messages: readonly ChatMessage[]): boolean {
  return messages
    .slice(beforeLastUser(messages).length + 1)
    .some((message) => message.role === 'assistant' && message.parts.length > 0)
}

function stitched(rendered: readonly ChatMessage[], window: readonly ChatMessage[]): ChatMessage[] {
  const cut = rendered.findIndex((message) => message.id === window[0]?.id)
  return cut === -1 ? [...window] : [...rendered.slice(0, cut), ...window]
}

function overlaps(rendered: readonly ChatMessage[], hydration: ChatSessionHydration): boolean {
  const start = hydration.messages[0]
  return start === undefined || rendered.some((message) => message.id === start.id)
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function createChat(options: CreateChatOptions): Chat {
  return useChat(options)
}

export function createChatSession(options: CreateChatSessionOptions): ChatSession {
  const [run, setRun] = createSignal<RunState>({phase: 'known', source: null})
  const runSource = createMemo(() => run().source)
  const setRunSource = (update: (current: RunClockSource | null) => RunClockSource | null): void => {
    setRun((current) => ({...current, source: update(current.source)}))
  }
  const receive = (next: RunClockSource | null): void => {
    const current = run()
    if (current.phase !== 'stop-queued' || next === current.source || !heardRun(current.runId, next)) {
      setRun({...current, source: next})
      return
    }
    setRun({phase: 'known', source: next})
    if (next !== null && !isRunPhaseTerminal(next.lifecycle.phase)) void stop()
  }
  const [served, setServed] = createStore<{
    pending: ApprovalAsk[]
    harnesses: Record<string, string>
    historyError: Error | undefined
  }>({
    pending: [],
    harnesses: {},
    historyError: undefined,
  })
  const hydrating: CardArrival[][] = []
  const arrive = (arrival: CardArrival): void => {
    hydrating.forEach((arrivals) => arrivals.push(arrival))
    setServed('pending', (pending) => arrived(pending, arrival))
  }
  const withdraw = (approvalId: string): void => {
    setServed('pending', (pending) => withoutCard(pending, approvalId))
  }
  const whileHydrating = async <Result>(read: () => Promise<Result>): Promise<Result> => {
    const arrivals: CardArrival[] = []
    hydrating.push(arrivals)
    try {
      return await read()
    } finally {
      hydrating.splice(hydrating.indexOf(arrivals), 1)
    }
  }
  const latestHistory = async <Result>(load: Promise<Result>): Promise<Result> => {
    try {
      const hydration = await load
      setServed('historyError', undefined)
      return hydration
    } catch (cause) {
      const failure = asError(cause)
      setServed('historyError', failure)
      throw failure
    }
  }
  const connected = options.connect({
    onLifecycle: (lifecycle) => {
      receive({lifecycle, receivedAt: Date.now()})
      if (lifecycle.phase === 'aborted' && lifecycle.runId === chat.runId() && chat.isLoading()) chat.stop()
    },
    onHydrated: (hydration) => {
      receive(newerRun(run().source, hydration))
      const arrivals = hydrating[0] ?? []
      setServed(
        'pending',
        reconcile(arrivals.reduce(arrived, hydration.pendingApprovals.map(buildAsk)), {key: 'approvalId'}),
      )
      setServed('harnesses', hydration.messageHarness)
    },
    onRunError: () => {
      void refresh().catch((error: unknown) => options.onError?.(asError(error)))
    },
    onLive: () => {
      if (chat.isLoading()) return
      void refresh().catch((error: unknown) => options.onError?.(asError(error)))
    },
    onApprovalAsk: (ask) => arrive({kind: 'ask', ask}),
    onApprovalSettled: (approvalId) => arrive({kind: 'settle', approvalId}),
    joinsRun: (runId) =>
      joinedRun(runId).catch((error: unknown) => {
        options.onError?.(asError(error))
        return false
      }),
  })
  const hydrate = connected.hydrate
  const connection: ChatSessionConnection = {
    ...connected,
    refresh: (before) => whileHydrating(() => connected.refresh(before)),
    ...(hydrate === undefined
      ? {}
      : {
          hydrate: (threadId, hydrateOptions) =>
            whileHydrating(() =>
              hydrateOptions?.before === undefined
                ? latestHistory(hydrate(threadId, hydrateOptions))
                : hydrate(threadId, hydrateOptions),
            ),
        }),
  }
  const reaching = async (hydration: ChatSessionHydration): Promise<ChatMessage[]> => {
    if (overlaps(chat.messages(), hydration) || hydration.page?.truncated !== true) return hydration.messages
    const older = await connection.refresh(hydration.page.cursor)
    return [...(await reaching(older)), ...hydration.messages]
  }
  const latestWindow = async (): Promise<ChatMessage[]> => reaching(await connection.refresh())
  const shownIds = (): Set<string> => new Set(chat.messages().map((message) => message.id))
  const showWindow = (window: readonly ChatMessage[], shown: Set<string>): void => {
    const fetched = new Set(window.map((message) => message.id))
    const sentSince = chat.messages().filter((message) => !shown.has(message.id) && !fetched.has(message.id))
    chat.setMessages(stitched(chat.messages(), [...window, ...sentSince]))
  }
  const refresh = async (): Promise<void> => {
    const shown = shownIds()
    showWindow(await latestWindow(), shown)
  }
  const declinesRun = (runId: string): boolean => chat.isLoading() || chat.runId() === runId || loadFailed()
  const declinesKnownRun = (runId: string, known: boolean): boolean =>
    declinesRun(runId) || (known && !runningHere(runSource(), runId))
  const joinedRun = async (runId: string): Promise<boolean> => {
    const known = runSource()?.lifecycle.runId === runId
    if (declinesKnownRun(runId, known)) return false
    const shown = shownIds()
    const window = await latestWindow()
    if (declinesKnownRun(runId, known)) return false
    showWindow(window, shown)
    return true
  }
  const chat: Chat = useChat({
    threadId: options.sessionId,
    connection,
    persistence: true,
    history: {pageSize: CHAT_HISTORY_PAGE_SIZE},
    live: true,
    queue: 'queue',
    onError: (error) => {
      const current = run()
      if (current.phase === 'stop-queued') setRun({phase: 'withdrawn', source: current.source, hidden: error})
      options.onError?.(error)
    },
  })
  onCleanup(() => connection.close())
  const stopQueued = createMemo(() => {
    const current = run()
    return current.phase === 'stop-queued' && chatBusy(chat) && current.runId === chat.runId()
  })
  const stopping = createMemo(() => stopQueued() || runSource()?.lifecycle.phase === 'stopping')
  const stopped = createMemo(() => runSource()?.lifecycle.phase === 'aborted')
  const runError = createMemo(() => {
    const source = runSource()
    return source && source.lifecycle.phase === 'failed' ? source.lifecycle.error : null
  })
  const sessionRunning = createMemo(() => {
    const source = runSource()
    return source !== null && !isRunPhaseTerminal(source.lifecycle.phase)
  })
  const runInProgress = createMemo(() => chatBusy(chat) || sessionRunning())
  const error = createMemo(() => {
    const current = run()
    const latest = chat.error()
    return current.phase === 'withdrawn' && current.hidden === latest ? undefined : latest
  })
  const loadFailed = createMemo(() => served.historyError !== undefined && chat.error() === served.historyError)
  const seenRunIds = (): string[] => {
    const source = runSource()
    const lifecycleRunIds = source && !isRunPhaseTerminal(source.lifecycle.phase) ? [source.lifecycle.runId] : []
    const localRunId = chat.runId()
    return localRunId === null ? lifecycleRunIds : [...lifecycleRunIds, localRunId]
  }
  const stopRun = async (): Promise<void> => {
    const runIds = seenRunIds()
    setRunSource(stoppingRun)
    try {
      await options.stop(runIds)
    } finally {
      chat.stop()
      setRunSource(stoppedRun)
    }
    await refresh()
  }
  const queuesStop = (): boolean => chatBusy(chat) && !acknowledged(runSource(), chat.runId())
  const stop = async (): Promise<void> => {
    if (stopQueued()) return
    if (queuesStop()) {
      const runId = chat.runId()
      setRun((current) => ({phase: 'stop-queued', source: current.source, runId}))
      if (runId === null) return
      await options.stop([runId]).catch((error: unknown) => options.onError?.(asError(error)))
      return
    }
    await stopRun().catch((error: unknown) => options.onError?.(asError(error)))
  }
  const withdrawn = createMemo(() => {
    const current = run()
    return current.phase === 'withdrawn' && current.hidden === chat.error()
  })
  const lastLocalRunId = createMemo<string | null>((previous) => chat.runId() ?? previous, null)
  const neverLeft = (before: RunState, errorBefore: Error | undefined): Error | undefined => {
    if (run() !== before && withdrawn()) return new Error('The message was taken back before the engine had it')
    const refused = chat.error()
    if (refused === undefined || refused === errorBefore || answered(chat.messages())) return undefined
    if (refused instanceof StreamReconnectLimitError) return refused
    if (runSource()?.lifecycle.runId === lastLocalRunId()) return undefined
    return refused
  }
  const sendMessage: Chat['sendMessage'] = async (...args) => {
    const before = run()
    const errorBefore = chat.error()
    await chat.sendMessage(...args)
    const failure = neverLeft(before, errorBefore)
    if (failure === undefined) return
    chat.setMessages(beforeLastUser(chat.messages()))
    throw failure
  }
  const decide = (approvalId: string, reply: PermissionReply): Promise<void> =>
    options.decide(approvalId, reply).finally(() => withdraw(approvalId))
  const flushed = createScheduled((flush) => {
    const throttled = throttle(flush, MESSAGES_FLUSH_MS)
    makeEventListener(document, 'visibilitychange', () => {
      if (document.hidden) return
      throttled.clear()
      flush()
    })
    return throttled
  })
  const messages = createMemo<ReturnType<Chat['messages']>>((shown) => {
    const latest = chat.messages()
    return !chatBusy(chat) || flushed() ? latest : shown
  }, chat.messages())
  return {
    ...chat,
    messages,
    sendMessage,
    error,
    withdrawn,
    stop,
    refresh,
    stopping,
    stopped,
    runSource,
    runError,
    sessionRunning,
    runInProgress,
    loadFailed,
    pendingApprovals: () => served.pending,
    readHarness: (messageId) => served.harnesses[messageId],
    decide,
  }
}
