import {eq, sql} from 'drizzle-orm'
import {Effect} from 'effect'
import {chatMessages, chatMetadata, chatRuns, type ConcivDb} from '@conciv/db'

export async function runningThreadIds(db: ConcivDb): Promise<ReadonlySet<string>> {
  const rows = await Effect.runPromise(
    db.selectDistinct({threadId: chatRuns.threadId}).from(chatRuns).where(eq(chatRuns.status, 'running')),
  )
  return new Set(rows.map((row) => row.threadId))
}

export async function clearThread(db: ConcivDb, threadId: string): Promise<void> {
  const owned = `${threadId}:`
  await Effect.runPromise(
    db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(chatRuns).where(eq(chatRuns.threadId, threadId))
        yield* tx.delete(chatMessages).where(eq(chatMessages.threadId, threadId))
        yield* tx.delete(chatMetadata).where(sql`substr(${chatMetadata.key}, 1, ${owned.length}) = ${owned}`)
      }),
    ),
  )
}
