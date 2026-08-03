import {randomUUID} from 'node:crypto'
import {and, eq, isNull} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import type {NativeSessionRef, SessionRecord, SessionRecordInput} from '@conciv/protocol/chat-types'
import {isSessionId, SessionRecordSchema} from '@conciv/protocol/chat-types'
import type {HarnessSessionMeta} from '@conciv/protocol/harness-types'
import {sessions, type ConcivDb} from '@conciv/db'
import {sameCwd} from '@conciv/harness/cwd'

export type RowScope = {db: ConcivDb; harnessKind: string; cwd: string; mintId?: () => string}

const mintIdOf = (scope: RowScope): (() => string) => scope.mintId ?? (() => `conciv_${randomUUID()}`)

export async function rowById(db: ConcivDb, id: string): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id))
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export async function rowByNativeId(db: ConcivDb, nativeId: string): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.harnessSessionId, nativeId))
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export async function rowByNativeRef(db: ConcivDb, ref: NativeSessionRef): Promise<SessionRecord | null> {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.harnessKind, ref.harnessKind),
        eq(sessions.cwd, ref.cwd),
        eq(sessions.harnessSessionId, ref.nativeId),
      ),
    )
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export async function createRow(
  db: ConcivDb,
  input: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>,
): Promise<SessionRecord> {
  const now = Date.now()
  const record = SessionRecordSchema.parse({...input, createdAt: now, updatedAt: now})
  await db.insert(sessions).values(record)
  return record
}

export const nativeIdFor = async (db: ConcivDb, id: string): Promise<string | null> =>
  (await rowById(db, id))?.harnessSessionId ?? null

export async function recordNativeId(db: ConcivDb, id: string, nativeId: string): Promise<void> {
  await db.update(sessions).set({harnessSessionId: nativeId, updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function ensureRow(db: ConcivDb, id: string, harnessKind: string, cwd: string): Promise<void> {
  if (await rowById(db, id)) return
  await createRow(db, {
    id,
    harnessSessionId: null,
    harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd,
    deletedAt: null,
  })
}

export async function resolveRow(scope: RowScope, body: {id?: string}): Promise<{sessionId: string}> {
  const mint = mintIdOf(scope)
  if (body.id && isSessionId(body.id)) {
    const existing = await rowById(scope.db, body.id)
    if (existing) return {sessionId: existing.id}
    return {sessionId: body.id}
  }
  if (body.id) {
    const wrapped = await rowByNativeId(scope.db, body.id)
    if (wrapped) return {sessionId: wrapped.id}
    const created = await createRow(scope.db, {
      id: mint(),
      harnessSessionId: body.id,
      harnessKind: scope.harnessKind,
      origin: 'external',
      title: null,
      model: null,
      usage: null,
      cwd: scope.cwd,
      deletedAt: null,
    })
    return {sessionId: created.id}
  }
  return {sessionId: mint()}
}

export async function openNativeRow(scope: RowScope, ref: NativeSessionRef): Promise<{sessionId: string}> {
  const existing = await rowByNativeRef(scope.db, ref)
  if (existing) {
    if (existing.deletedAt !== null) {
      await scope.db.update(sessions).set({deletedAt: null, updatedAt: Date.now()}).where(eq(sessions.id, existing.id))
    }
    return {sessionId: existing.id}
  }
  const created = await createRow(scope.db, {
    id: mintIdOf(scope)(),
    harnessSessionId: ref.nativeId,
    harnessKind: ref.harnessKind,
    origin: 'external',
    title: null,
    model: null,
    usage: null,
    cwd: ref.cwd,
    deletedAt: null,
  })
  return {sessionId: created.id}
}

export async function tombstoneRow(db: ConcivDb, id: string): Promise<void> {
  await db.update(sessions).set({deletedAt: Date.now(), updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function restoreRow(db: ConcivDb, id: string): Promise<void> {
  await db.update(sessions).set({deletedAt: null, updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function ensureAgentRow(scope: RowScope, nativeId: string): Promise<SessionRecord> {
  const existing = await rowByNativeId(scope.db, nativeId)
  if (existing) return existing
  return createRow(scope.db, {
    id: mintIdOf(scope)(),
    harnessSessionId: nativeId,
    harnessKind: scope.harnessKind,
    origin: 'agent',
    title: null,
    model: null,
    usage: null,
    cwd: scope.cwd,
    deletedAt: null,
  })
}

export async function sweepEmptyRows(db: ConcivDb): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.origin, 'chat'), isNull(sessions.harnessSessionId), isNull(sessions.title)))
}

export type SessionListInput = {
  db: ConcivDb
  harnessKind: string
  cwd: string
  nativeList: HarnessSessionMeta[]
  running: (sessionId: string) => boolean
  model: (sessionId: string) => string | null
  includeHidden: boolean
}

function nativeRefOf(row: SessionRecord): NativeSessionRef | null {
  if (!row.harnessSessionId) return null
  return {harnessKind: row.harnessKind, cwd: row.cwd, nativeId: row.harnessSessionId}
}

type RowFacts = {title: string; updatedAt: number; messageCount: number}

function rowFacts(row: SessionRecord, native: HarnessSessionMeta | undefined): RowFacts {
  if (!native) return {title: row.title ?? 'New session', updatedAt: row.updatedAt, messageCount: 0}
  return {
    title: row.title ?? native.derivedTitle,
    updatedAt: native.updatedAt,
    messageCount: native.messageCount,
  }
}

function rowMeta(row: SessionRecord, native: HarnessSessionMeta | undefined, input: SessionListInput): SessionMeta {
  return {
    ...rowFacts(row, native),
    id: row.id,
    running: input.running(row.id),
    origin: row.origin === 'external' ? 'external' : 'conciv',
    usage: row.usage,
    model: input.model(row.id) ?? row.model,
    hidden: row.deletedAt !== null,
    native: nativeRefOf(row),
  }
}

function nativeOnlyMeta(native: HarnessSessionMeta, input: SessionListInput): SessionMeta {
  return {
    id: native.id,
    title: native.derivedTitle,
    updatedAt: native.updatedAt,
    messageCount: native.messageCount,
    running: false,
    origin: 'external',
    usage: null,
    model: native.model ?? null,
    hidden: false,
    native: {harnessKind: input.harnessKind, cwd: input.cwd, nativeId: native.id},
  }
}

export async function listSessionMetas(input: SessionListInput): Promise<SessionMeta[]> {
  const rows = (await input.db.select().from(sessions))
    .map((row) => SessionRecordSchema.parse(row))
    .filter((row) => sameCwd(row.cwd, input.cwd))
    .filter((row) => input.includeHidden || row.deletedAt === null)
  const nativeById = new Map(input.nativeList.map((native) => [native.id, native]))
  const claimed = new Set(rows.flatMap((row) => (row.harnessSessionId ? [row.harnessSessionId] : [])))
  const ours = rows.map((row) =>
    rowMeta(row, row.harnessSessionId ? nativeById.get(row.harnessSessionId) : undefined, input),
  )
  const unmaterialized = input.nativeList
    .filter((native) => !claimed.has(native.id))
    .map((native) => nativeOnlyMeta(native, input))
  return [...ours, ...unmaterialized].toSorted((a, b) => b.updatedAt - a.updatedAt)
}
