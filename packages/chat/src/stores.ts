import {eq, like} from 'drizzle-orm'
import {chatMetadata, chatRuns, chatThreads, runMessages, runs, sessionHistory, type ConcivDb} from '@conciv/db'

export async function runningThreadIds(db: ConcivDb): Promise<ReadonlySet<string>> {
  const rows = await db
    .selectDistinct({threadId: chatRuns.threadId})
    .from(chatRuns)
    .where(eq(chatRuns.status, 'running'))
  return new Set(rows.map((row) => row.threadId))
}

export function clearThread(db: ConcivDb, threadId: string): void {
  db.transaction((tx) => {
    tx.delete(runs).where(eq(runs.sessionId, threadId)).run()
    tx.delete(chatRuns).where(eq(chatRuns.threadId, threadId)).run()
    tx.delete(chatThreads).where(eq(chatThreads.threadId, threadId)).run()
    tx.delete(runMessages).where(eq(runMessages.sessionId, threadId)).run()
    tx.delete(sessionHistory).where(eq(sessionHistory.sessionId, threadId)).run()
    tx.delete(chatMetadata)
      .where(like(chatMetadata.key, `${threadId}:%`))
      .run()
  })
}
