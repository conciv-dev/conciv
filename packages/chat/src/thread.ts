import {toChatMessages, toModelMessages, type ChatMessage} from '@conciv/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ConcivDb} from '@conciv/db'
import {readThread, threadMessages, updateThread} from './thread-queries.js'
import type {ChatDeps} from './runtime.js'
import {normalizeHistoryToolNames} from './tool-names.js'

function rejoinSplitMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.reduce<ChatMessage[]>((rejoined, message) => {
    const previous = rejoined.at(-1)
    if (previous === undefined || previous.id !== message.id) {
      rejoined.push(message)
      return rejoined
    }
    rejoined.splice(-1, 1, {...previous, parts: [...previous.parts, ...message.parts]})
    return rejoined
  }, [])
}

export function sessionSnapshot(deps: ChatDeps, sessionId: SessionId): ChatMessage[] {
  const stored = rejoinSplitMessages(toChatMessages(threadMessages(deps.db, sessionId)))
  return normalizeHistoryToolNames(stored, deps.toolNames)
}

export function beginRunMessages(db: ConcivDb, threadId: string): number {
  return readThread(db, threadId).messages.length
}

export function writeRunMessages(db: ConcivDb, threadId: string, from: number, messages: ChatMessage[]): void {
  updateThread(db, threadId, (state) => ({
    ...state,
    pendingFrom: Math.min(state.pendingFrom ?? from, from),
    messages: [...state.messages.slice(0, from), ...toModelMessages(messages)],
  }))
}

export function settleRunMessages(db: ConcivDb, threadId: string): void {
  updateThread(db, threadId, (state) => ({...state, pendingFrom: null}))
}
