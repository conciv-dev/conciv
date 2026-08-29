import {modelMessagesToUIMessages, uiMessageToModelMessages} from '@tanstack/ai'
import type {UIMessage} from '@tanstack/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import {readThread, threadMessages, updateThread, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {normalizeHistoryToolNames} from './tool-names.js'

export function sessionSnapshot(deps: ChatDeps, sessionId: SessionId): UIMessage[] {
  return normalizeHistoryToolNames(modelMessagesToUIMessages(threadMessages(deps.db, sessionId)), deps.toolNames)
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
