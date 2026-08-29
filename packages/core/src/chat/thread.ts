import {modelMessagesToUIMessages, uiMessageToModelMessages} from '@tanstack/ai'
import type {UIMessage} from '@tanstack/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import {threadMessages, updateThread, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {normalizeHistoryToolNames} from './tool-names.js'

export function sessionSnapshot(deps: ChatDeps, sessionId: SessionId): UIMessage[] {
  return normalizeHistoryToolNames(modelMessagesToUIMessages(threadMessages(deps.db, sessionId)), deps.toolNames)
}

export function writeRunMessages(db: ConcivDb, threadId: string, messages: UIMessage[]): void {
  updateThread(db, threadId, (state) => {
    const pendingFrom = state.pendingFrom ?? state.messages.length
    return {
      ...state,
      pendingFrom,
      messages: [...state.messages.slice(0, pendingFrom), ...messages.flatMap(uiMessageToModelMessages)],
    }
  })
}

export function settleRunMessages(db: ConcivDb, threadId: string): void {
  updateThread(db, threadId, (state) => ({...state, pendingFrom: null}))
}
