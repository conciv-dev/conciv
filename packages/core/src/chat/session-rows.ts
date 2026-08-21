import {randomUUID} from 'node:crypto'
import {and, eq, isNull} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import type {
  HarnessSessionId,
  NativeSessionRef,
  SessionId,
  SessionRecord,
  SessionRecordInput,
} from '@conciv/protocol/chat-types'
import {
  HarnessSessionId as HarnessSessionIdSchema,
  isSessionId,
  SessionId as SessionIdSchema,
  SessionRecordSchema,
} from '@conciv/protocol/chat-types'
import type {HarnessSessionMeta} from '@conciv/protocol/harness-types'
import {sessions, type ConcivDb} from '@conciv/db'
import {sameCwd} from '@conciv/harness/cwd'

export type RowScope = {db: ConcivDb; harnessKind: string; cwd: string; mintId?: () => SessionId}

const mintIdOf = (scope: RowScope): (() => SessionId) =>
  scope.mintId ?? (() => SessionIdSchema.parse(`conciv_${randomUUID()}`))

export async function rowById(db: ConcivDb, id: SessionId): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id))
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export async function rowByNativeId(db: ConcivDb, nativeId: HarnessSessionId): Promise<SessionRecord | null> {
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

export const nativeIdFor = async (db: ConcivDb, id: SessionId): Promise<HarnessSessionId | null> =>
  (await rowById(db, id))?.harnessSessionId ?? null

export async function recordNativeId(db: ConcivDb, id: SessionId, nativeId: HarnessSessionId): Promise<void> {
  await db.update(sessions).set({harnessSessionId: nativeId, updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function ensureRow(db: ConcivDb, id: SessionId, harnessKind: string, cwd: string): Promise<void> {
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

export async function resolveRow(scope: RowScope, body: {id?: string}): Promise<{sessionId: SessionId}> {
  const mint = mintIdOf(scope)
  if (body.id && isSessionId(body.id)) {
    const existing = await rowById(scope.db, body.id)
    if (existing) return {sessionId: existing.id}
    return {sessionId: body.id}
  }
  const nativeId = HarnessSessionIdSchema.safeParse(body.id)
  if (nativeId.success) {
    const wrapped = await rowByNativeId(scope.db, nativeId.data)
    if (wrapped) return {sessionId: wrapped.id}
    const created = await createRow(scope.db, {
      id: mint(),
      harnessSessionId: nativeId.data,
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

export async function openNativeRow(scope: RowScope, ref: NativeSessionRef): Promise<{sessionId: SessionId}> {
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

export async function tombstoneRow(db: ConcivDb, id: SessionId): Promise<void> {
  await db.update(sessions).set({deletedAt: Date.now(), updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function restoreRow(db: ConcivDb, id: SessionId): Promise<void> {
  await db.update(sessions).set({deletedAt: null, updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function ensureAgentRow(scope: RowScope, nativeId: HarnessSessionId): Promise<SessionRecord> {
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

export async function mintExternalRow(scope: RowScope): Promise<SessionId> {
  const created = await createRow(scope.db, {
    id: mintIdOf(scope)(),
    harnessSessionId: null,
    harnessKind: scope.harnessKind,
    origin: 'external',
    title: null,
    model: null,
    usage: null,
    cwd: scope.cwd,
    deletedAt: null,
  })
  return created.id
}

export async function resolveOrMintRow(scope: RowScope, id: SessionId | null): Promise<SessionId> {
  if (id !== null) return id
  return mintExternalRow(scope)
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
  running: (sessionId: SessionId) => boolean
  model: (sessionId: SessionId) => string | null
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

async function materializeNative(native: HarnessSessionMeta, input: SessionListInput): Promise<SessionMeta> {
  const scope: RowScope = {db: input.db, harnessKind: input.harnessKind, cwd: input.cwd}
  const {sessionId} = await openNativeRow(scope, {
    harnessKind: input.harnessKind,
    cwd: input.cwd,
    nativeId: native.id,
  })
  const row = await rowById(input.db, sessionId)
  if (row === null) throw new Error(`session row "${sessionId}" vanished while listing native sessions`)
  return rowMeta(row, native, input)
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
  const unmaterialized = await Promise.all(
    input.nativeList.filter((native) => !claimed.has(native.id)).map((native) => materializeNative(native, input)),
  )
  return [...ours, ...unmaterialized].toSorted((a, b) => b.updatedAt - a.updatedAt)
}
