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
import type {QueuedMessage} from '@tanstack/ai-client'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {chatBusy} from '@conciv/protocol/chat-busy'

export type Chat = UseChatReturn

export type CreateChatOptions = Parameters<typeof useChat>[0]

export type ChatApprovalScope = 'once' | 'session'

export type ChatSessionHydration = {
  messages: ChatMessage[]
  lastRun: RunLifecycle | null
  pendingApprovals: readonly ApprovalAsk[]
}

export type ChatSessionConnection = SubscribeConnectionAdapter & {
  refresh: () => Promise<ChatSessionHydration>
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
  interruptAndFlush: () => Promise<readonly QueuedMessage[]>
  stopping: Accessor<boolean>
  stopped: Accessor<boolean>
  runSource: Accessor<RunClockSource | null>
  runError: Accessor<string | null>
  sessionRunning: Accessor<boolean>
  runInProgress: Accessor<boolean>
  hydrated: Accessor<boolean>
  pendingApprovals: Accessor<ApprovalAsk[]>
  decide: (approvalId: string, approved: boolean, scope: ChatApprovalScope) => Promise<void>
}

function askOf(approval: ApprovalAsk): ApprovalAsk {
  return {
    approvalId: approval.approvalId,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    input: approval.input,
  }
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

function stoppedRun(current: RunClockSource | null): RunClockSource | null {
  if (current === null || isRunPhaseTerminal(current.lifecycle.phase)) return current
  const now = Date.now()
  return {
    lifecycle: {...current.lifecycle, phase: 'aborted', finishedAt: now, serverNow: now, error: null},
    receivedAt: now,
  }
}

function withRenderedIds(rendered: readonly ChatMessage[], stored: readonly ChatMessage[]): ChatMessage[] {
  return stored.map((message, index) => {
    const shown = rendered[index]
    return shown?.role === message.role ? {...message, id: shown.id} : message
  })
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function isTextContent(content: QueuedMessage['content']): content is string {
  return typeof content === 'string'
}

function joinedQueueText(queued: readonly QueuedMessage[]): string | null {
  if (!queued.every((item) => isTextContent(item.content))) return null
  return queued.map((item) => item.content).join('\n')
}

export function createChat(options: CreateChatOptions): Chat {
  return useChat(options)
}

export function createChatSession(options: CreateChatSessionOptions): ChatSession {
  const [runSource, setRunSource] = createSignal<RunClockSource | null>(null)
  const [hydrated, setHydrated] = createSignal(false)
  const [asks, setAsks] = createStore<{pending: ApprovalAsk[]}>({pending: []})
  const connection = options.connect({
    onLifecycle: (lifecycle) => setRunSource({lifecycle, receivedAt: Date.now()}),
    onHydrated: (hydration) => {
      setRunSource((current) => newerRun(current, hydration))
      setAsks('pending', reconcile(hydration.pendingApprovals.map(askOf), {key: 'approvalId'}))
      setHydrated(true)
    },
    onRunError: () => {
      void refresh().catch((error: unknown) => options.onError?.(asError(error)))
    },
    onApprovalAsk: (ask) => {
      setAsks('pending', (pending) =>
        pending.some((waiting) => waiting.approvalId === ask.approvalId) ? pending : [...pending, ask],
      )
    },
    joinsRun: (runId) =>
      joinedRun(runId).catch((error: unknown) => {
        options.onError?.(asError(error))
        return false
      }),
  })
  const refresh = async (): Promise<void> => {
    const hydration = await connection.refresh()
    chat.setMessages(withRenderedIds(chat.messages(), hydration.messages))
  }
  const ownsRun = (runId: string): boolean => chat.isLoading() || chat.runId() === runId
  const joinedRun = async (runId: string): Promise<boolean> => {
    if (ownsRun(runId)) return false
    const hydration = await connection.refresh()
    if (ownsRun(runId)) return false
    chat.setMessages(withRenderedIds(chat.messages(), hydration.messages))
    return true
  }
  const chat = useChat({
    threadId: options.sessionId,
    connection,
    persistence: true,
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
  const seenRunIds = (): string[] => {
    const source = runSource()
    const lifecycleRunIds = source && !isRunPhaseTerminal(source.lifecycle.phase) ? [source.lifecycle.runId] : []
    const localRunId = chat.runId()
    return localRunId === null ? lifecycleRunIds : [...lifecycleRunIds, localRunId]
  }
  const stopRun = async (): Promise<void> => {
    const runIds = seenRunIds()
    try {
      await options.stop(runIds)
    } finally {
      chat.stop()
    }
    setRunSource(stoppedRun)
    await refresh()
  }
  let latestStop: Promise<void> | null = null
  const stop = (): Promise<void> => {
    const stopRequest = stopRun().catch((error: unknown) => options.onError?.(asError(error)))
    latestStop = stopRequest
    return stopRequest
  }
  const decide = async (approvalId: string, approved: boolean, scope: ChatApprovalScope): Promise<void> => {
    const ask = asks.pending.find((waiting) => waiting.approvalId === approvalId)
    const decision = await options.decide(approvalId, approved, scope)
    setAsks('pending', (pending) => pending.filter((waiting) => waiting.approvalId !== approvalId))
    if (!decision.startsTurn || ask === undefined) return
    await chat.sendMessage(decisionText(ask.toolName, approved, scope))
  }
  const sendQueuedSequentially = async (
    queued: readonly QueuedMessage[],
    stopRequest: Promise<void>,
  ): Promise<readonly QueuedMessage[]> => {
    for (const [index, item] of queued.entries()) {
      if (latestStop !== stopRequest) return queued.slice(index)
      await chat.sendMessage(item.content)
    }
    return []
  }
  const interruptAndFlush = async (): Promise<readonly QueuedMessage[]> => {
    const queued = chat.queue()
    const stopRequest = stop()
    await stopRequest
    if (queued.length === 0 || latestStop !== stopRequest) return queued
    const joined = joinedQueueText(queued)
    const flushed =
      joined === null ? sendQueuedSequentially(queued, stopRequest) : chat.sendMessage(joined).then(() => [])
    return flushed.catch((error: unknown) => {
      options.onError?.(asError(error))
      return []
    })
  }
  return {
    ...chat,
    stop,
    refresh,
    interruptAndFlush,
    stopping,
    stopped,
    runSource,
    runError,
    sessionRunning,
    runInProgress,
    hydrated,
    pendingApprovals: () => asks.pending,
    decide,
  }
}
