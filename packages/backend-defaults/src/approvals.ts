import {UiAnswerValueSchema, type UiAnswer} from '@conciv/types/ui-types'

const UI_TOOL_NAME = 'conciv_ui'

const UI_CALL_WAIT_MS = 5_000

const UI_ANSWER_WAIT_MS = 120_000

const MCP_PREFIX = /^mcp__.+?__/

type UiWaiter = (callId: string | null) => void

type UiAnswerSlot = {value: Promise<unknown>; settle: (value: unknown) => void}

type UiThread = {calls: string[]; waiters: UiWaiter[]; answers: Map<string, UiAnswerSlot>}

function answerSlot(): UiAnswerSlot {
  const slot: {settle: (value: unknown) => void} = {settle: () => undefined}
  const value = new Promise<unknown>((resolve) => {
    slot.settle = resolve
  })
  return {value, settle: (answer) => slot.settle(answer)}
}

export type UiChannel = {
  noteToolCall: (threadId: string, toolCallId: string, toolName: string) => void
  answer: (threadId: string, toolCallId: string, value: unknown) => boolean
  ask: (threadId: string) => Promise<UiAnswer>
}

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

function withTimeout<T>(start: (settle: (value: T) => void) => void, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    timer.unref()
    start((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

export type UiWaits = {callWaitMs?: number; answerWaitMs?: number}

export function createUiChannel({
  callWaitMs = UI_CALL_WAIT_MS,
  answerWaitMs = UI_ANSWER_WAIT_MS,
}: UiWaits = {}): UiChannel {
  const threads = new Map<string, UiThread>()
  const ensureThread = (threadId: string): UiThread => {
    const existing = threads.get(threadId)
    if (existing) return existing
    const created: UiThread = {calls: [], waiters: [], answers: new Map()}
    threads.set(threadId, created)
    return created
  }
  const nextCall = (thread: UiThread): Promise<string | null> => {
    const queued = thread.calls.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return withTimeout<string | null>((settle) => thread.waiters.push(settle), callWaitMs, null)
  }
  return {
    noteToolCall: (threadId, toolCallId, toolName) => {
      if (toolName.replace(MCP_PREFIX, '') !== UI_TOOL_NAME) return
      const thread = ensureThread(threadId)
      thread.answers.set(toolCallId, answerSlot())
      const waiter = thread.waiters.shift()
      if (waiter) waiter(toolCallId)
      if (!waiter) thread.calls.push(toolCallId)
    },
    answer: (threadId, toolCallId, value) => {
      const slot = threads.get(threadId)?.answers.get(toolCallId)
      if (slot === undefined) return false
      slot.settle(value)
      return true
    },
    ask: async (threadId) => {
      const thread = ensureThread(threadId)
      const callId = await nextCall(thread)
      if (callId === null) return UNANSWERED
      const slot = thread.answers.get(callId)
      if (slot === undefined) return UNANSWERED
      const value = await withTimeout<unknown>((settle) => void slot.value.then(settle), answerWaitMs, null)
      thread.answers.delete(callId)
      const parsed = UiAnswerValueSchema.safeParse(value)
      return parsed.success ? {answered: true, value: parsed.data} : UNANSWERED
    },
  }
}
