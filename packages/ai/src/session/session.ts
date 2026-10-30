import type {SubscribeConnectionAdapter} from '@tanstack/ai-client'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import {createMemo, createSignal, onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {isRunPhaseTerminal, type ApprovalAsk, type RunClockSource, type RunLifecycle} from '../events/events.js'
import type {ChatMessage, QueuedMessage} from '../messages/messages.js'

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
}

export type CreateChatSessionOptions = {
  sessionId: string
  connect: (callbacks: ChatSessionCallbacks) => ChatSessionConnection
  stop: (runIds: string[]) => Promise<unknown>
  decide: (approvalId: string, approved: boolean, scope: ChatApprovalScope) => Promise<unknown>
  onError?: (error: Error) => void
}

export type ChatSession = Omit<Chat, 'stop'> & {
  stop: () => Promise<void>
  refresh: () => Promise<void>
  interruptAndFlush: () => Promise<void>
  stopping: Accessor<boolean>
  runSource: Accessor<RunClockSource | null>
  runError: Accessor<string | null>
  sessionRunning: Accessor<boolean>
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

function approvedText(title: string, scope: ChatApprovalScope): string {
  return scope === 'session' ? `Approved for this session: ${title}` : `Approved: ${title}`
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
  })
  const refresh = async (): Promise<void> => {
    const hydration = await connection.refresh()
    chat.setMessages(hydration.messages)
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
  const runError = createMemo(() => {
    const source = runSource()
    return source && source.lifecycle.phase === 'failed' ? source.lifecycle.error : null
  })
  const sessionRunning = createMemo(() => {
    const source = runSource()
    return source !== null && !isRunPhaseTerminal(source.lifecycle.phase)
  })
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
  const stop = (): Promise<void> => stopRun().catch((error: unknown) => options.onError?.(asError(error)))
  const decide = async (approvalId: string, approved: boolean, scope: ChatApprovalScope): Promise<void> => {
    const ask = asks.pending.find((waiting) => waiting.approvalId === approvalId)
    await options.decide(approvalId, approved, scope)
    setAsks('pending', (pending) => pending.filter((waiting) => waiting.approvalId !== approvalId))
    if (approved && ask !== undefined) await chat.sendMessage(approvedText(ask.toolName, scope))
  }
  const sendQueuedSequentially = async (queued: readonly QueuedMessage[]): Promise<void> => {
    for (const item of queued) await chat.sendMessage(item.content)
  }
  const interruptAndFlush = async (): Promise<void> => {
    const queued = chat.queue()
    await stop()
    if (queued.length === 0) return
    const joined = joinedQueueText(queued)
    const flushed = joined === null ? sendQueuedSequentially(queued) : chat.sendMessage(joined)
    await flushed.catch((error: unknown) => options.onError?.(asError(error)))
  }
  return {
    ...chat,
    stop,
    refresh,
    interruptAndFlush,
    stopping,
    runSource,
    runError,
    sessionRunning,
    hydrated,
    pendingApprovals: () => asks.pending,
    decide,
  }
}
