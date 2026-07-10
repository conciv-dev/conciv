import {EventType, type StreamChunk} from '@tanstack/ai'
import type {UiAnswer, UiAnswerValue} from '@conciv/protocol/ui-types'

export const UI_ASK_TIMEOUT_MS = 120_000

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

type Waiter = {settle: (answer: UiAnswer) => void}

type SessionAsks = {
  waitingAsks: Waiter[]
  waitingCalls: string[]
  paired: Map<string, Waiter>
  answers: Map<string, UiAnswer>
}

export type UiAsks = {
  ask: (sessionId: string, timeoutMs: number) => Promise<UiAnswer>
  observe: (sessionId: string, chunk: StreamChunk) => void
  reply: (sessionId: string, toolCallId: string, value: UiAnswerValue) => boolean
  endTurn: (sessionId: string) => void
}

function uiToolCallIdOf(chunk: StreamChunk): string | null {
  if (chunk.type !== EventType.TOOL_CALL_START) return null
  return chunk.toolCallName === 'conciv_ui' ? chunk.toolCallId : null
}

export function makeUiAsks(): UiAsks {
  const sessions = new Map<string, SessionAsks>()

  function forSession(sessionId: string): SessionAsks {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const fresh: SessionAsks = {waitingAsks: [], waitingCalls: [], paired: new Map(), answers: new Map()}
    sessions.set(sessionId, fresh)
    return fresh
  }

  function detach(state: SessionAsks, waiter: Waiter): void {
    const index = state.waitingAsks.indexOf(waiter)
    if (index !== -1) state.waitingAsks.splice(index, 1)
    for (const [toolCallId, candidate] of state.paired) {
      if (candidate === waiter) state.paired.delete(toolCallId)
    }
  }

  function pairOrQueue(state: SessionAsks, waiter: Waiter): void {
    const toolCallId = state.waitingCalls.shift()
    if (toolCallId === undefined) {
      state.waitingAsks.push(waiter)
      return
    }
    const stashed = state.answers.get(toolCallId)
    if (stashed) {
      state.answers.delete(toolCallId)
      waiter.settle(stashed)
      return
    }
    state.paired.set(toolCallId, waiter)
  }

  function ask(sessionId: string, timeoutMs: number): Promise<UiAnswer> {
    return new Promise<UiAnswer>((resolve) => {
      const state = forSession(sessionId)
      const waiter: Waiter = {
        settle: (answer) => {
          clearTimeout(timer)
          detach(state, waiter)
          resolve(answer)
        },
      }
      const timer = setTimeout(() => waiter.settle(UNANSWERED), timeoutMs)
      pairOrQueue(state, waiter)
    })
  }

  function observe(sessionId: string, chunk: StreamChunk): void {
    const toolCallId = uiToolCallIdOf(chunk)
    if (toolCallId === null) return
    const state = forSession(sessionId)
    const waiter = state.waitingAsks.shift()
    if (waiter) {
      state.paired.set(toolCallId, waiter)
      return
    }
    state.waitingCalls.push(toolCallId)
  }

  function stash(state: SessionAsks, toolCallId: string, value: UiAnswerValue): boolean {
    if (!state.waitingCalls.includes(toolCallId) || state.answers.has(toolCallId)) return false
    state.answers.set(toolCallId, {answered: true, value})
    return true
  }

  function reply(sessionId: string, toolCallId: string, value: UiAnswerValue): boolean {
    const state = sessions.get(sessionId)
    if (!state) return false
    const waiter = state.paired.get(toolCallId)
    if (!waiter) return stash(state, toolCallId, value)
    waiter.settle({answered: true, value})
    return true
  }

  function endTurn(sessionId: string): void {
    const state = sessions.get(sessionId)
    if (!state) return
    sessions.delete(sessionId)
    for (const waiter of [...state.waitingAsks, ...state.paired.values()]) waiter.settle(UNANSWERED)
  }

  return {ask, observe, reply, endTurn}
}
