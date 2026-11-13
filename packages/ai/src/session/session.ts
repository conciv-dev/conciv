import type {SubscribeConnectionAdapter} from '@tanstack/ai-client'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import {createMemo, createSignal, onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {
  isRunPhaseTerminal,
  type ApprovalAsk,
  type RunClockSource,
  type RunLifecycle,
} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {chatBusy} from '@conciv/protocol/chat-busy'
import {CHAT_HISTORY_PAGE_SIZE} from '@conciv/protocol/chat-types'

export type Chat = UseChatReturn

export type CreateChatOptions = Parameters<typeof useChat>[0]

export type ChatApprovalScope = 'once' | 'session'

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
  onApprovalAsk: (ask: ApprovalAsk) => void
  joinsRun: (runId: string) => Promise<boolean>
}

export type CreateChatSessionOptions = {
  sessionId: string
  connect: (callbacks: ChatSessionCallbacks) => ChatSessionConnection
  stop: (runIds: string[]) => Promise<unknown>
  decide: (approvalId: string, approved: boolean, scope: ChatApprovalScope) => Promise<{startsTurn: boolean}>
  onError?: (error: Error) => void
}

export type ChatSession = Omit<Chat, 'stop'> & {
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
  decide: (approvalId: string, approved: boolean, scope: ChatApprovalScope) => Promise<void>
}

function buildAsk({approvalId, toolCallId, toolName, input, permission}: ApprovalAsk): ApprovalAsk {
  const ask = {approvalId, toolCallId, toolName, input}
  return permission === undefined ? ask : {...ask, permission}
}

function decisionText(title: string, approved: boolean, scope: ChatApprovalScope): string {
  const action = title.replace(/^Approve /, '')
  if (!approved) return `Denied: ${action}`
  return scope === 'session' ? `Approved for this session: ${action}` : `Approved: ${action}`
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
  const [runSource, setRunSource] = createSignal<RunClockSource | null>(null)
  const [served, setServed] = createStore<{pending: ApprovalAsk[]; harnesses: Record<string, string>}>({
    pending: [],
    harnesses: {},
  })
  const connection = options.connect({
    onLifecycle: (lifecycle) => {
      setRunSource({lifecycle, receivedAt: Date.now()})
      if (lifecycle.phase === 'aborted' && lifecycle.runId === chat.runId() && chat.isLoading()) chat.stop()
    },
    onHydrated: (hydration) => {
      setRunSource((current) => newerRun(current, hydration))
      setServed('pending', reconcile(hydration.pendingApprovals.map(buildAsk), {key: 'approvalId'}))
      setServed('harnesses', hydration.messageHarness)
    },
    onRunError: () => {
      void refresh().catch((error: unknown) => options.onError?.(asError(error)))
    },
    onApprovalAsk: (ask) => {
      setServed('pending', (pending) =>
        pending.some((waiting) => waiting.approvalId === ask.approvalId) ? pending : [...pending, ask],
      )
    },
    joinsRun: (runId) =>
      joinedRun(runId).catch((error: unknown) => {
        options.onError?.(asError(error))
        return false
      }),
  })
  const reaching = async (hydration: ChatSessionHydration): Promise<ChatMessage[]> => {
    if (overlaps(chat.messages(), hydration) || hydration.page?.truncated !== true) return hydration.messages
    const older = await connection.refresh(hydration.page.cursor)
    return [...(await reaching(older)), ...hydration.messages]
  }
  const latestWindow = async (): Promise<ChatMessage[]> => reaching(await connection.refresh())
  const showWindow = (window: readonly ChatMessage[]): void => {
    chat.setMessages(stitched(chat.messages(), window))
  }
  const refresh = async (): Promise<void> => {
    showWindow(await latestWindow())
  }
  const declinesRun = (runId: string): boolean => chat.isLoading() || chat.runId() === runId || loadFailed()
  const declinesKnownRun = (runId: string, known: boolean): boolean =>
    declinesRun(runId) || (known && !runningHere(runSource(), runId))
  const joinedRun = async (runId: string): Promise<boolean> => {
    const known = runSource()?.lifecycle.runId === runId
    if (declinesKnownRun(runId, known)) return false
    const window = await latestWindow()
    if (declinesKnownRun(runId, known)) return false
    showWindow(window)
    return true
  }
  const chat = useChat({
    threadId: options.sessionId,
    connection,
    persistence: true,
    history: {pageSize: CHAT_HISTORY_PAGE_SIZE},
    live: true,
    queue: 'queue',
    onError: options.onError,
  })
  onCleanup(() => connection.close())
  const stopping = createMemo(() => runSource()?.lifecycle.phase === 'stopping')
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
  const loadFailed = createMemo(() => chat.error() !== undefined && chat.messages().length === 0)
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
  const stop = (): Promise<void> => stopRun().catch((error: unknown) => options.onError?.(asError(error)))
  const decide = async (approvalId: string, approved: boolean, scope: ChatApprovalScope): Promise<void> => {
    const ask = served.pending.find((waiting) => waiting.approvalId === approvalId)
    const decision = await options.decide(approvalId, approved, scope)
    setServed('pending', (pending) => pending.filter((waiting) => waiting.approvalId !== approvalId))
    if (!decision.startsTurn || ask === undefined) return
    await chat.sendMessage(decisionText(ask.toolName, approved, scope))
  }
  return {
    ...chat,
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
