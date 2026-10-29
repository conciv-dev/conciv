import {eq} from 'drizzle-orm'
import type {MessageStore} from '@tanstack/ai-persistence'
import type {ConcivDb} from './db.js'
import {chatThreads} from './run-schema.js'

export function createMessageStore(db: ConcivDb): MessageStore {
  return {
    loadThread: async (threadId) => {
      const rows = await db
        .select({messagesJson: chatThreads.messagesJson})
        .from(chatThreads)
        .where(eq(chatThreads.threadId, threadId))
        .limit(1)
      return rows[0]?.messagesJson ?? []
    },
    saveThread: async (threadId, messages) => {
      const updatedAt = Date.now()
      await db
        .insert(chatThreads)
        .values({threadId, messagesJson: messages, updatedAt})
        .onConflictDoUpdate({target: chatThreads.threadId, set: {messagesJson: messages, updatedAt}})
    },
  }
}
