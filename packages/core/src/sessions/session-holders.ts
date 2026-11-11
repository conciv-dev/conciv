import {hostname} from 'node:os'
import {and, eq} from 'drizzle-orm'
import {sessions, type ConcivDb} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'

export function createSessionHolders(db: ConcivDb) {
  const host = hostname()
  return {
    take: async (input: {sessionId: SessionId; pid: number}): Promise<void> => {
      await db
        .update(sessions)
        .set({attachedPid: input.pid, attachedAt: Date.now(), attachedHost: host})
        .where(eq(sessions.id, input.sessionId))
    },
    detach: async (pid: number): Promise<SessionId[]> => {
      const cleared = await db
        .update(sessions)
        .set({attachedPid: null, attachedAt: null, attachedHost: null})
        .where(and(eq(sessions.attachedPid, pid), eq(sessions.attachedHost, host)))
        .returning({id: sessions.id})
      return cleared.map((row) => SessionId.parse(row.id))
    },
  }
}
