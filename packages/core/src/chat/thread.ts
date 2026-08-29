import {modelMessagesToUIMessages, uiMessageToModelMessages} from '@tanstack/ai'
import type {UIMessage} from '@tanstack/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import {readThread, threadMessages, updateThread, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {normalizeHistoryToolNames} from './tool-names.js'

function rejoinSplitMessages(messages: UIMessage[]): UIMessage[] {
  return messages.reduce<UIMessage[]>((rejoined, message) => {
    const previous = rejoined.at(-1)
    if (previous === undefined || previous.id !== message.id) {
      rejoined.push(message)
      return rejoined
    }
    rejoined.splice(-1, 1, {...previous, parts: [...previous.parts, ...message.parts]})
    return rejoined
  }, [])
}

export function sessionSnapshot(deps: ChatDeps, sessionId: SessionId): UIMessage[] {
  const stored = rejoinSplitMessages(modelMessagesToUIMessages(threadMessages(deps.db, sessionId)))
  return normalizeHistoryToolNames(stored, deps.toolNames)
}

export function beginRunMessages(db: ConcivDb, threadId: string): number {
  return readThread(db, threadId).messages.length
}

export function writeRunMessages(db: ConcivDb, threadId: string, from: number, messages: UIMessage[]): void {
  updateThread(db, threadId, (state) => ({
    ...state,
    pendingFrom: Math.min(state.pendingFrom ?? from, from),
    messages: [...state.messages.slice(0, from), ...messages.flatMap(uiMessageToModelMessages)],
  }))
}

export function settleRunMessages(db: ConcivDb, threadId: string): void {
  updateThread(db, threadId, (state) => ({...state, pendingFrom: null}))
}
