import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import type {ManagedRuntime} from 'effect'
import type {ChatPlane} from '@conciv/chat'
import {clearPageChanges, deleteSessionCaptures, drafts, markers, sessions, type ConcivDb} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import {Bus, KV, SessionEvent, SessionSchema} from '@conciv/plugin-host'
import {removeInstructionEntries} from '../runtime/instruction-entries.js'
import {createRow, reuseDeletedRow, rowById, tombstoneRow, type FreshRowInput} from './session-rows.js'
import type {createSessionSearch} from './session-search.js'

type SessionRenaming = {db: ConcivDb; search: Pick<ReturnType<typeof createSessionSearch>, 'retitle'>}

type SessionDeletion = {
  db: ConcivDb
  plane: Pick<ChatPlane, 'clear'>
  pluginHost: ManagedRuntime.ManagedRuntime<Bus.Interface | KV.Interface, never>
}

export const newSessionId = (): SessionId => SessionId.parse(`conciv_${randomUUID()}`)

type ChatSessionScope = {harnessKind: string; cwd: string}

function chatRow(scope: ChatSessionScope, sessionId: SessionId): FreshRowInput {
  return {
    id: sessionId,
    harnessSessionId: null,
    harnessKind: scope.harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd: scope.cwd,
    deletedAt: null,
  }
}

async function markNew(db: ConcivDb, sessionId: SessionId): Promise<void> {
  await db.insert(markers).values({id: randomUUID(), sessionId, afterMessageId: null, kind: 'new'})
}

export async function createChatSession(
  db: ConcivDb,
  scope: ChatSessionScope,
  sessionId: SessionId = newSessionId(),
): Promise<{sessionId: SessionId}> {
  await createRow(db, chatRow(scope, sessionId))
  await markNew(db, sessionId)
  return {sessionId}
}

export async function reuseDeletedChatSession(
  db: ConcivDb,
  scope: ChatSessionScope,
  sessionId: SessionId,
): Promise<{sessionId: SessionId}> {
  reuseDeletedRow(db, chatRow(scope, sessionId))
  await markNew(db, sessionId)
  return {sessionId}
}

function cleanTitle(title: string): string {
  return title
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export async function renameSession(
  renaming: SessionRenaming,
  sessionId: SessionId,
  given: string,
): Promise<{title: string} | 'missing'> {
  const row = await rowById(renaming.db, sessionId)
  if (!row) return 'missing'
  const title = cleanTitle(given)
  await renaming.db.update(sessions).set({title, updatedAt: Date.now()}).where(eq(sessions.id, sessionId))
  if (row.harnessSessionId !== null) await renaming.search.retitle(row.harnessKind, row.harnessSessionId, title)
  return {title}
}

export async function deleteSession(deletion: SessionDeletion, sessionId: SessionId): Promise<void> {
  await tombstoneRow(deletion.db, sessionId)
  await deletion.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
  await deletion.plane.clear(sessionId)
  await deleteSessionCaptures(deletion.db, sessionId)
  await clearPageChanges(deletion.db, sessionId)
  await deletion.pluginHost.runPromise(KV.Service.use((kv) => removeInstructionEntries(kv, sessionId)))
  await deletion.pluginHost.runPromise(
    Bus.Service.use((bus) => bus.publish(SessionEvent.Deleted, {sessionID: SessionSchema.Id.make(sessionId)})),
  )
}
