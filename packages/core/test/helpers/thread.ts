import {modelMessagesToUIMessages} from '@tanstack/ai'
import type {UIMessage} from '@tanstack/ai'
import {readThread, type ConcivDb} from '@conciv/db'

export function threadUiMessages(db: ConcivDb, sessionId: string): UIMessage[] {
  return modelMessagesToUIMessages(readThread(db, sessionId).messages)
}

export function threadUserTexts(db: ConcivDb, sessionId: string): string[] {
  return threadUiMessages(db, sessionId)
    .filter((message) => message.role === 'user')
    .map((message) =>
      message.parts
        .filter((part) => part.type === 'text')
        .map((part) => (typeof part.content === 'string' ? part.content : ''))
        .join(' '),
    )
}

export function threadPendingFrom(db: ConcivDb, sessionId: string): number | null {
  return readThread(db, sessionId).pendingFrom
}
