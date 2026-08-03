import {UiAnswerValueSchema, type UiAnswer} from '@conciv/protocol/ui-types'

export const ASK_TIMEOUT_MS = 120_000

export const TOOL_CALL_WAIT_MS = 5_000

export const UI_TOOL_NAME = 'conciv_ui'

const MCP_PREFIX = /^mcp__[a-z0-9-]+__/i

export function bareToolName(name: string): string {
  return name.replace(MCP_PREFIX, '')
}

type Ask = {promise: Promise<unknown>; settle: (value: unknown) => void}

type UiCall = {callId: string; claimed: boolean}

type SessionAsks = {
  asks: Map<string, Ask>
  uiCalls: UiCall[]
  uiWaiters: Set<(callId: string | null) => void>
}

export type AskRegistry = {
  open: (sessionId: string, key: string) => void
  opened: (sessionId: string, key: string) => boolean
  owner: (key: string) => string | null
  pending: (sessionId: string) => string[]
  reply: (sessionId: string, key: string, value: unknown) => boolean
  waitFor: (sessionId: string, key: string, timeoutMs: number) => Promise<unknown>
  cancel: (sessionId: string) => void
  noteToolCall: (sessionId: string, toolCallId: string, toolName: string) => void
  nextUiCall: (sessionId: string, timeoutMs: number) => Promise<string | null>
}

function makeAsk(): Ask {
  const holder = {settle: (_value: unknown): void => {}}
  const promise = new Promise<unknown>((resolve) => {
    holder.settle = resolve
  })
  return {promise, settle: (value) => holder.settle(value)}
}

export function createAskRegistry(): AskRegistry {
  const bySession = new Map<string, SessionAsks>()

  const stateOf = (sessionId: string): SessionAsks => {
    const existing = bySession.get(sessionId)
    if (existing) return existing
    const created: SessionAsks = {asks: new Map(), uiCalls: [], uiWaiters: new Set()}
    bySession.set(sessionId, created)
    return created
  }

  const askOf = (state: SessionAsks, key: string): Ask => {
    const existing = state.asks.get(key)
    if (existing) return existing
    const created = makeAsk()
    state.asks.set(key, created)
    return created
  }

  return {
    open: (sessionId, key) => {
      askOf(stateOf(sessionId), key)
    },
    opened: (sessionId, key) => bySession.get(sessionId)?.asks.has(key) ?? false,
    owner: (key) => {
      for (const [sessionId, state] of bySession) {
        if (state.asks.has(key)) return sessionId
      }
      return null
    },
    pending: (sessionId) => [...(bySession.get(sessionId)?.asks.keys() ?? [])],
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

export async function askUi(asks: AskRegistry, sessionId: string): Promise<UiAnswer> {
  const callId = await asks.nextUiCall(sessionId, TOOL_CALL_WAIT_MS)
  if (callId === null) return UNANSWERED
  const value = await asks.waitFor(sessionId, callId, ASK_TIMEOUT_MS)
  const parsed = UiAnswerValueSchema.safeParse(value)
  return parsed.success ? {answered: true, value: parsed.data} : UNANSWERED
}
