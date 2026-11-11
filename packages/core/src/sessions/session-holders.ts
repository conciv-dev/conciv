import {hostname} from 'node:os'
import {and, eq, isNotNull, type SQL} from 'drizzle-orm'
import {sessions, type ConcivDb} from '@conciv/db'
import {SessionEndReason} from '@conciv/extension'
import {pidAlive} from '@conciv/harness-init/pid-alive'
import {SessionId} from '@conciv/protocol/chat-types'

export function createSessionHolders(input: {
  db: ConcivDb
  ended: (sessionId: SessionId, reason: SessionEndReason) => Promise<void>
}) {
  const {db, ended} = input
  const host = hostname()
  const onHost = eq(sessions.attachedHost, host)

  async function release(where: SQL | undefined, reason: SessionEndReason): Promise<void> {
    const cleared = await db
      .update(sessions)
      .set({attachedPid: null, attachedAt: null, attachedHost: null})
      .where(where)
      .returning({id: sessions.id})
    await Promise.all(cleared.map((row) => ended(SessionId.parse(row.id), reason)))
  }

  return {
    take: async (taken: {sessionId: SessionId; pid: number}): Promise<void> => {
      await db
        .update(sessions)
        .set({attachedPid: taken.pid, attachedAt: Date.now(), attachedHost: host})
        .where(eq(sessions.id, taken.sessionId))
    },
    detach: (pid: number): Promise<void> =>
      release(and(eq(sessions.attachedPid, pid), onHost), SessionEndReason.DETACHED),
    dispose: (): Promise<void> => release(and(isNotNull(sessions.attachedPid), onHost), SessionEndReason.DISPOSED),
    sweep: async (): Promise<void> => {
      const held = await db
        .select({id: sessions.id, pid: sessions.attachedPid})
        .from(sessions)
        .where(and(isNotNull(sessions.attachedPid), onHost))
      const dead = held.flatMap((row) => (row.pid === null || pidAlive(row.pid) ? [] : [{id: row.id, pid: row.pid}]))
      await Promise.all(
        dead.map((row) =>
          release(and(eq(sessions.id, row.id), eq(sessions.attachedPid, row.pid), onHost), SessionEndReason.DEAD),
        ),
      )
    },
  }
}
