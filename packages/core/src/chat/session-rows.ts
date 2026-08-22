import {randomUUID} from 'node:crypto'
import {and, desc, eq, inArray, isNull} from 'drizzle-orm'
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
import {realpathOrSelf, sameCwd} from '@conciv/harness/cwd'
import {logError} from '../lib/debug.js'

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

async function claimNativeRow(
  scope: RowScope,
  ref: NativeSessionRef,
  origin: 'agent' | 'external',
): Promise<SessionRecord> {
  const now = Date.now()
  const record = SessionRecordSchema.parse({
    id: mintIdOf(scope)(),
    harnessSessionId: ref.nativeId,
    harnessKind: ref.harnessKind,
    origin,
    title: null,
    model: null,
    usage: null,
    cwd: ref.cwd,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await scope.db
    .insert(sessions)
    .values(record)
    .onConflictDoNothing({target: [sessions.harnessKind, sessions.cwd, sessions.harnessSessionId]})
  const settled = await rowByNativeRef(scope.db, ref)
  if (settled === null) throw new Error(`session row for native session "${ref.nativeId}" vanished while claiming it`)
  return settled
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

const LATEST_ROW_WINDOW = 50

const cwdSpellings = (cwd: string): string[] => [...new Set([cwd, realpathOrSelf(cwd)])]

async function latestRow(scope: RowScope): Promise<SessionRecord | null> {
  const rows = await scope.db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), eq(sessions.origin, 'chat'), inArray(sessions.cwd, cwdSpellings(scope.cwd))))
    .orderBy(desc(sessions.updatedAt))
    .limit(LATEST_ROW_WINDOW)
  const mine = rows.map((row) => SessionRecordSchema.parse(row)).find((row) => sameCwd(row.cwd, scope.cwd))
  return mine ?? null
}

export async function resolveRow(scope: RowScope, body: {id?: string}): Promise<{sessionId: SessionId}> {
  const mint = mintIdOf(scope)
  if (body.id && isSessionId(body.id)) {
    const existing = await rowById(scope.db, body.id)
    if (existing) return {sessionId: existing.id}
    await ensureRow(scope.db, body.id, scope.harnessKind, scope.cwd)
    return {sessionId: body.id}
  }
  const nativeId = HarnessSessionIdSchema.safeParse(body.id)
  if (nativeId.success) {
    const ref: NativeSessionRef = {harnessKind: scope.harnessKind, cwd: scope.cwd, nativeId: nativeId.data}
    const wrapped = await rowByNativeRef(scope.db, ref)
    if (wrapped) return {sessionId: wrapped.id}
    const claimed = await claimNativeRow(scope, ref, 'external')
    return {sessionId: claimed.id}
  }
  const latest = await latestRow(scope)
  if (latest) return {sessionId: latest.id}
  const minted = mint()
  await ensureRow(scope.db, minted, scope.harnessKind, scope.cwd)
  return {sessionId: minted}
}

export async function openNativeRow(scope: RowScope, ref: NativeSessionRef): Promise<{sessionId: SessionId}> {
  const existing = await rowByNativeRef(scope.db, ref)
  if (existing) {
    if (existing.deletedAt !== null) {
      await scope.db.update(sessions).set({deletedAt: null, updatedAt: Date.now()}).where(eq(sessions.id, existing.id))
    }
    return {sessionId: existing.id}
  }
  const claimed = await claimNativeRow(scope, ref, 'external')
  return {sessionId: claimed.id}
}

export async function tombstoneRow(db: ConcivDb, id: SessionId): Promise<void> {
  await db.update(sessions).set({deletedAt: Date.now(), updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function restoreRow(db: ConcivDb, id: SessionId): Promise<void> {
  await db.update(sessions).set({deletedAt: null, updatedAt: Date.now()}).where(eq(sessions.id, id))
}

export async function ensureAgentRow(scope: RowScope, nativeId: HarnessSessionId): Promise<SessionRecord> {
  const ref: NativeSessionRef = {harnessKind: scope.harnessKind, cwd: scope.cwd, nativeId}
  const existing = await rowByNativeRef(scope.db, ref)
  if (existing) return existing
  return claimNativeRow(scope, ref, 'agent')
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

export async function anonymousExternalRow(scope: RowScope): Promise<SessionId> {
  const rows = await scope.db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.origin, 'external'),
        eq(sessions.harnessKind, scope.harnessKind),
        isNull(sessions.harnessSessionId),
        isNull(sessions.deletedAt),
        inArray(sessions.cwd, cwdSpellings(scope.cwd)),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .limit(1)
  const existing = rows[0]
  if (existing) return SessionRecordSchema.parse(existing).id
  return mintExternalRow(scope)
}

export async function sweepEmptyRows(db: ConcivDb): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(inArray(sessions.origin, ['chat', 'external']), isNull(sessions.harnessSessionId), isNull(sessions.title)),
    )
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
    .map((row) => SessionRecordSchema.safeParse(row))
    .flatMap((parsed) => {
      if (parsed.success) return [parsed.data]
      logError(
        `[core] a session row failed the session record schema and is left out of the listing: ${parsed.error.message}`,
      )
      return []
    })
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
