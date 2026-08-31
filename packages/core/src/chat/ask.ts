import {UiAnswerValueSchema, type UiAnswer} from '@conciv/protocol/ui-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import {ASK_TIMEOUT_MS, TOOL_CALL_WAIT_MS, UI_TOOL_NAME} from './ask-constants.js'

const MCP_PREFIX = /^mcp__.+?__/

function bareToolName(name: string): string {
  return name.replace(MCP_PREFIX, '')
}

type Ask = {promise: Promise<unknown>; settle: (value: unknown) => void; approval: PendingApproval | null}

export type PendingApproval = {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  runId: string | null
}

type UiCall = {callId: string; claimed: boolean}

type SessionAsks = {
  asks: Map<string, Ask>
  uiCalls: UiCall[]
  uiWaiters: Set<(callId: string | null) => void>
}

export type AskRegistry = {
  open: (sessionId: SessionId, key: string, approval?: PendingApproval) => void
  owner: (key: string) => SessionId | null
  pending: (sessionId: SessionId) => string[]
  pendingApprovals: (sessionId: SessionId) => PendingApproval[]
  reply: (sessionId: SessionId, key: string, value: unknown) => boolean
  waitFor: (sessionId: SessionId, key: string, timeoutMs: number) => Promise<unknown>
  cancel: (sessionId: SessionId) => void
  noteToolCall: (sessionId: SessionId, toolCallId: string, toolName: string) => void
  nextUiCall: (sessionId: SessionId, timeoutMs: number) => Promise<string | null>
}

function makeAsk(approval: PendingApproval | null): Ask {
  const holder = {settle: (_value: unknown): void => {}}
  const promise = new Promise<unknown>((resolve) => {
    holder.settle = resolve
  })
  return {promise, settle: (value) => holder.settle(value), approval}
}

export function createAskRegistry(): AskRegistry {
  const bySession = new Map<SessionId, SessionAsks>()

  const stateOf = (sessionId: SessionId): SessionAsks => {
    const existing = bySession.get(sessionId)
    if (existing) return existing
    const created: SessionAsks = {asks: new Map(), uiCalls: [], uiWaiters: new Set()}
    bySession.set(sessionId, created)
    return created
  }

  const askOf = (state: SessionAsks, key: string, approval: PendingApproval | null = null): Ask => {
    const existing = state.asks.get(key)
    if (existing) return existing
    const created = makeAsk(approval)
    state.asks.set(key, created)
    return created
  }

  return {
    open: (sessionId, key, approval) => {
      askOf(stateOf(sessionId), key, approval ?? null)
    },
    owner: (key) => {
      for (const [sessionId, state] of bySession) {
        if (state.asks.has(key)) return sessionId
      }
      return null
    },
    pending: (sessionId) => [...(bySession.get(sessionId)?.asks.keys() ?? [])],
    pendingApprovals: (sessionId) =>
      [...(bySession.get(sessionId)?.asks.values() ?? [])].flatMap((ask) => (ask.approval ? [ask.approval] : [])),
    reply: (sessionId, key, value) => {
      const state = bySession.get(sessionId)
      const ask = state?.asks.get(key)
      if (!ask) return false
      ask.settle(value)
      return true
    },
    waitFor: async (sessionId, key, timeoutMs) => {
      const state = stateOf(sessionId)
      const ask = askOf(state, key)
      const timer = setTimeout(() => ask.settle(null), timeoutMs)
      timer.unref?.()
      const value = await ask.promise
      clearTimeout(timer)
      state.asks.delete(key)
      if (
        bySession.get(sessionId) === state &&
        state.asks.size === 0 &&
        state.uiCalls.length === 0 &&
        state.uiWaiters.size === 0
      ) {
        bySession.delete(sessionId)
      }
      return value
    },
    cancel: (sessionId) => {
      const state = bySession.get(sessionId)
      if (!state) return
      for (const ask of state.asks.values()) ask.settle(null)
      const waiters = [...state.uiWaiters]
      bySession.delete(sessionId)
      for (const waiter of waiters) waiter(null)
    },
    noteToolCall: (sessionId, toolCallId, toolName) => {
      if (bareToolName(toolName) !== UI_TOOL_NAME) return
      const state = stateOf(sessionId)
      askOf(state, toolCallId)
      state.uiCalls.push({callId: toolCallId, claimed: false})
      const waiters = [...state.uiWaiters]
      state.uiWaiters.clear()
      for (const waiter of waiters) waiter(toolCallId)
    },
    nextUiCall: (sessionId, timeoutMs) => {
      const state = stateOf(sessionId)
      const unclaimed = state.uiCalls.find((call) => !call.claimed)
      if (unclaimed) {
        unclaimed.claimed = true
        return Promise.resolve(unclaimed.callId)
      }
      return new Promise((resolve) => {
        const waiter = (callId: string | null): void => {
          clearTimeout(timer)
          state.uiWaiters.delete(waiter)
          const noted = callId === null ? undefined : state.uiCalls.find((call) => call.callId === callId)
          if (noted) noted.claimed = true
          resolve(callId)
        }
        const timer = setTimeout(() => waiter(null), timeoutMs)
        timer.unref?.()
        state.uiWaiters.add(waiter)
      })
    },
  }
}

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

export async function askUi(asks: AskRegistry, sessionId: SessionId): Promise<UiAnswer> {
  const callId = await asks.nextUiCall(sessionId, TOOL_CALL_WAIT_MS)
  if (callId === null) return UNANSWERED
  const value = await asks.waitFor(sessionId, callId, ASK_TIMEOUT_MS)
  const parsed = UiAnswerValueSchema.safeParse(value)
  return parsed.success ? {answered: true, value: parsed.data} : UNANSWERED
}
