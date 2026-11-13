import {randomUUID} from 'node:crypto'
import {and, desc, eq, inArray, isNull, lt, notInArray, or, sql} from 'drizzle-orm'
import {keyBy, mapValues, uniqBy} from 'es-toolkit'
import {z} from 'zod'
import type {SessionHit, SessionMeta} from '@conciv/contract'
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
import type {
  HarnessListCursor,
  HarnessListPage,
  HarnessSessionMeta,
  HarnessSessionPage,
} from '@conciv/protocol/harness-types'
import {anchorKey, chatMetadata, sessions, TRANSCRIPT_NAMESPACE, type ConcivDb} from '@conciv/db'
import {realpathOrSelf, sameCwd} from '@conciv/harness/cwd'
import {pageAfter} from '@conciv/harness/page'
import {logError} from '../lib/debug.js'

export type RowScope = {db: ConcivDb; harnessKind: string; cwd: string; mintId?: () => SessionId}

const resolveMintId = (scope: RowScope): (() => SessionId) =>
  scope.mintId ?? (() => SessionIdSchema.parse(`conciv_${randomUUID()}`))

export async function rowById(db: ConcivDb, id: SessionId): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id))
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export function currentRow(db: ConcivDb, id: SessionId): SessionRecord | null {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
  return row === undefined ? null : SessionRecordSchema.parse(row)
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
    id: resolveMintId(scope)(),
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

export async function recordNativeId(
  db: ConcivDb,
  id: SessionId,
  harnessKind: string,
  nativeId: HarnessSessionId,
): Promise<void> {
  await db
    .update(sessions)
    .set({harnessSessionId: nativeId, updatedAt: Date.now()})
    .where(and(eq(sessions.id, id), eq(sessions.harnessKind, harnessKind)))
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
  const mint = resolveMintId(scope)
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
    id: resolveMintId(scope)(),
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

export function recordActivity(db: ConcivDb, sessionId: SessionId, title: string, at: number): void {
  db.update(sessions)
    .set({
      updatedAt: sql`max(${sessions.updatedAt}, ${at})`,
      title: sql`coalesce(${sessions.title}, iif(${sessions.harnessSessionId} is null, ${title === '' ? null : title}, null))`,
    })
    .where(eq(sessions.id, sessionId))
    .run()
}

export async function sweepEmptyRows(db: ConcivDb): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(inArray(sessions.origin, ['chat', 'external']), isNull(sessions.harnessSessionId), isNull(sessions.title)),
    )
}

const EARLIER_NATIVES_NAMESPACE = 'conciv.session.earlierNatives'

const EarlierNativesSchema = z.array(z.object({harnessKind: z.string(), nativeId: HarnessSessionIdSchema})).catch([])

export function switchRowHarness(db: ConcivDb, id: SessionId, harnessKind: string, model: string | null): void {
  db.transaction((tx) => {
    const outgoing = tx
      .select({harnessKind: sessions.harnessKind, nativeId: sessions.harnessSessionId})
      .from(sessions)
      .where(eq(sessions.id, id))
      .get()
    if (outgoing?.nativeId) {
      const stored = tx
        .select({valueJson: chatMetadata.valueJson})
        .from(chatMetadata)
        .where(and(eq(chatMetadata.namespace, EARLIER_NATIVES_NAMESPACE), eq(chatMetadata.key, id)))
        .get()
      const valueJson = [
        ...EarlierNativesSchema.parse(stored?.valueJson),
        {harnessKind: outgoing.harnessKind, nativeId: outgoing.nativeId},
      ]
      tx.insert(chatMetadata)
        .values({namespace: EARLIER_NATIVES_NAMESPACE, key: id, valueJson})
        .onConflictDoUpdate({target: [chatMetadata.namespace, chatMetadata.key], set: {valueJson}})
        .run()
    }
    tx.update(sessions)
      .set({harnessKind, harnessSessionId: null, model, effort: null, updatedAt: Date.now()})
      .where(eq(sessions.id, id))
      .run()
    tx.delete(chatMetadata)
      .where(and(eq(chatMetadata.namespace, TRANSCRIPT_NAMESPACE), eq(chatMetadata.key, anchorKey(id))))
      .run()
  })
}

export type Found = Pick<SessionHit, 'excerpt' | 'matched'>

export type NativePage = {harnessKind: string; page: HarnessSessionPage; found?: ReadonlyMap<string, Found>}

const NOT_FOUND: Found = {excerpt: null, matched: []}

type MetaContext = {
  db: ConcivDb
  running: ReadonlySet<string>
  model: (sessionId: SessionId) => string | null
}

export type SessionListInput = MetaContext & {
  cwd: string
  nativePages: NativePage[]
  page: HarnessListPage
  includeHidden: boolean
  search: string | null
}

type NativeSession = {harnessKind: string; meta: HarnessSessionMeta; found: Found}

type PageEntry =
  | {kind: 'native'; native: NativeSession; cursor: HarnessListCursor}
  | {kind: 'row'; row: SessionRecord; cursor: HarnessListCursor}

type ListedSession = {row: SessionRecord; native: HarnessSessionMeta | undefined}

type ListedHit = ListedSession & {found: Found; preview: NativeSessionRef | null}

export async function listSessionMetas(
  input: SessionListInput,
): Promise<{sessions: Omit<SessionHit, 'resume'>[]; next: HarnessListCursor | null}> {
  const frontier = sourcesFrontier(input.nativePages)
  const entries = [...nativeEntries(input.nativePages), ...(await concivOnlyEntries(input))]
  const covered = frontier === null ? entries : entries.filter((entry) => !olderThan(entry.cursor, frontier))
  const merged = pageAfter(covered, input.page, (entry) => entry.cursor)
  const listed = await listedSessions(merged.items, input)
  return {
    sessions: listed.map((session) => ({
      ...rowMeta(session, input),
      cwd: sameCwd(session.row.cwd, input.cwd) ? null : session.row.cwd,
      ...session.found,
      preview: session.preview,
    })),
    next: merged.next ?? frontier,
  }
}

export function buildSessionMeta(context: MetaContext, session: ListedSession): SessionMeta {
  return rowMeta(session, context)
}

function nativeEntries(pages: NativePage[]): PageEntry[] {
  return pages.flatMap(({harnessKind, page, found}) =>
    page.sessions.map((meta): PageEntry => ({
      kind: 'native',
      native: {harnessKind, meta, found: found?.get(meta.id) ?? NOT_FOUND},
      cursor: {updatedAt: meta.updatedAt, id: meta.id},
    })),
  )
}

async function concivOnlyEntries(input: SessionListInput): Promise<PageEntry[]> {
  const after = input.page.after
  const listingKinds = input.nativePages.map(({harnessKind}) => harnessKind)
  const rows = await input.db
    .select()
    .from(sessions)
    .where(
      and(
        inArray(sessions.cwd, cwdSpellings(input.cwd)),
        or(isNull(sessions.harnessSessionId), notInArray(sessions.harnessKind, listingKinds)),
        input.includeHidden ? undefined : isNull(sessions.deletedAt),
        input.search === null ? undefined : sql`${sessions.title} like ${likePattern(input.search)} escape '\\'`,
        after === null
          ? undefined
          : or(
              lt(sessions.updatedAt, after.updatedAt),
              and(eq(sessions.updatedAt, after.updatedAt), lt(sessions.id, after.id)),
            ),
      ),
    )
    .orderBy(desc(sessions.updatedAt), desc(sessions.id))
    .limit(input.page.limit + 1)
  return rowsInCwd(rows, input.cwd).map((row) => ({
    kind: 'row',
    row,
    cursor: {updatedAt: row.updatedAt, id: row.id},
  }))
}

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

async function listedSessions(entries: PageEntry[], input: SessionListInput): Promise<ListedHit[]> {
  const natives = entries.filter((entry) => entry.kind === 'native').map((entry) => entry.native)
  const current = await currentOwners(input, natives)
  const earlier = await earlierOwners(
    input,
    natives.filter((native) => !current.has(buildNativeKey(native))),
  )
  const listed = await Promise.all(
    entries.map((entry) =>
      entry.kind === 'row'
        ? {row: entry.row, native: undefined, found: NOT_FOUND, preview: readNativeRef(entry.row)}
        : listedNative(
            entry.native,
            input,
            current.get(buildNativeKey(entry.native)),
            earlier.get(buildNativeKey(entry.native)),
          ),
    ),
  )
  return uniqBy(
    listed.filter((session) => session !== null),
    (session) => session.row.id,
  )
}

function sourcesFrontier(pages: NativePage[]): HarnessListCursor | null {
  const nexts = pages.flatMap(({page}) => (page.next === null ? [] : [page.next]))
  return nexts.reduce<HarnessListCursor | null>(
    (newest, next) => (newest === null || olderThan(newest, next) ? next : newest),
    null,
  )
}

function olderThan(cursor: HarnessListCursor, other: HarnessListCursor): boolean {
  if (cursor.updatedAt !== other.updatedAt) return cursor.updatedAt < other.updatedAt
  return cursor.id < other.id
}

async function currentOwners(input: SessionListInput, natives: NativeSession[]): Promise<Map<string, SessionRecord>> {
  if (natives.length === 0) return new Map()
  const homes = resolveHomes(natives, input)
  const rows = await input.db
    .select()
    .from(sessions)
    .where(
      inArray(
        sessions.harnessSessionId,
        natives.map(({meta}) => meta.id),
      ),
    )
  return new Map(
    validRows(SessionRecordSchema, rows, 'a session row')
      .filter((row): row is SessionRecord & {harnessSessionId: HarnessSessionId} => row.harnessSessionId !== null)
      .map((row) => [nativeKey(row.harnessKind, row.harnessSessionId), row] as const)
      .filter(([key, row]) => sameCwd(row.cwd, homes[key] ?? input.cwd)),
  )
}

const EarlierOwnerSchema = z.object({
  ownerId: SessionIdSchema,
  harnessKind: z.string(),
  nativeId: HarnessSessionIdSchema,
})

async function earlierOwners(input: SessionListInput, natives: NativeSession[]): Promise<Map<string, SessionRecord>> {
  if (natives.length === 0) return new Map()
  const wanted = new Set(natives.map(buildNativeKey))
  const nativeId = sql`json_extract(earlier.value, '$.nativeId')`
  const found = await input.db.all(
    sql`select ${chatMetadata.key} as ownerId, json_extract(earlier.value, '$.harnessKind') as harnessKind, ${nativeId} as nativeId from ${chatMetadata}, json_each(${chatMetadata.valueJson}) as earlier where ${eq(chatMetadata.namespace, EARLIER_NATIVES_NAMESPACE)} and ${inArray(
      nativeId,
      natives.map(({meta}) => meta.id),
    )}`,
  )
  const claims = validRows(EarlierOwnerSchema, found, 'an earlier native session claim').filter((claim) =>
    wanted.has(nativeKey(claim.harnessKind, claim.nativeId)),
  )
  if (claims.length === 0) return new Map()
  const owners = validRows(
    SessionRecordSchema,
    await input.db
      .select()
      .from(sessions)
      .where(
        inArray(
          sessions.id,
          claims.map(({ownerId}) => ownerId),
        ),
      ),
    'a session row',
  )
  const homes = resolveHomes(natives, input)
  const ownerById = keyBy(owners, (owner) => owner.id)
  const owned = claims
    .map((claim) => ({key: nativeKey(claim.harnessKind, claim.nativeId), owner: ownerById[claim.ownerId]}))
    .filter(
      (entry): entry is {key: string; owner: SessionRecord} =>
        entry.owner !== undefined && sameCwd(entry.owner.cwd, homes[entry.key] ?? input.cwd),
    )
  return new Map(owned.map(({key, owner}) => [key, owner]))
}

async function listedNative(
  native: NativeSession,
  input: SessionListInput,
  owner: SessionRecord | undefined,
  earlierOwner: SessionRecord | undefined,
): Promise<ListedHit | null> {
  const preview = {harnessKind: native.harnessKind, cwd: resolveHome(native, input), nativeId: native.meta.id}
  if (owner) return {row: await visibleRow(owner, input), native: native.meta, found: native.found, preview}
  if (earlierOwner) {
    const row = await visibleRow(earlierOwner, input)
    return input.search === null ? null : {row, native: undefined, found: native.found, preview}
  }
  return {row: await materializedRow(native, input), native: native.meta, found: native.found, preview}
}

async function visibleRow(row: SessionRecord, input: SessionListInput): Promise<SessionRecord> {
  if (row.deletedAt === null || input.includeHidden) return row
  await restoreRow(input.db, row.id)
  return {...row, deletedAt: null}
}

async function materializedRow(native: NativeSession, input: SessionListInput): Promise<SessionRecord> {
  const cwd = resolveHome(native, input)
  const scope: RowScope = {db: input.db, harnessKind: native.harnessKind, cwd}
  const {sessionId} = await openNativeRow(scope, {
    harnessKind: native.harnessKind,
    cwd,
    nativeId: native.meta.id,
  })
  const row = await rowById(input.db, sessionId)
  if (row === null) throw new Error(`session row "${sessionId}" vanished while listing native sessions`)
  return row
}

function resolveHome(native: NativeSession, input: SessionListInput): string {
  return input.search !== null && !sameCwd(native.meta.cwd, input.cwd) ? native.meta.cwd : input.cwd
}

function resolveHomes(natives: NativeSession[], input: SessionListInput): Record<string, string> {
  return mapValues(keyBy(natives, buildNativeKey), (native) => resolveHome(native, input))
}

function rowsInCwd(rows: unknown[], cwd: string): SessionRecord[] {
  return validRows(SessionRecordSchema, rows, 'a session row').filter((row) => sameCwd(row.cwd, cwd))
}

function validRows<T>(schema: z.ZodType<T>, rows: unknown[], what: string): T[] {
  return rows
    .map((row) => schema.safeParse(row))
    .filter((parsed) => {
      if (!parsed.success)
        logError(`[core] ${what} failed its schema and is left out of the listing: ${parsed.error.message}`)
      return parsed.success
    })
    .map((parsed) => parsed.data)
}

const buildNativeKey = (native: NativeSession): string => nativeKey(native.harnessKind, native.meta.id)

const nativeKey = (harnessKind: string, nativeId: string): string => JSON.stringify([harnessKind, nativeId])

function rowMeta(session: ListedSession, context: MetaContext): SessionMeta {
  const row = session.row
  return {
    ...rowFacts(row, session.native),
    harnessKind: row.harnessKind,
    id: row.id,
    running: context.running.has(row.id),
    origin: row.origin === 'external' ? 'external' : 'conciv',
    usage: row.usage,
    model: context.model(row.id) ?? row.model,
    effort: row.effort,
    hidden: row.deletedAt !== null,
    native: readNativeRef(row),
  }
}

function rowFacts(
  row: SessionRecord,
  native: HarnessSessionMeta | undefined,
): {title: string; updatedAt: number; sizeBytes?: number} {
  if (!native) return {title: row.title ?? 'New session', updatedAt: row.updatedAt}
  return {title: row.title ?? native.derivedTitle, updatedAt: native.updatedAt, sizeBytes: native.sizeBytes}
}

function readNativeRef(row: SessionRecord): NativeSessionRef | null {
  if (!row.harnessSessionId) return null
  return {harnessKind: row.harnessKind, cwd: row.cwd, nativeId: row.harnessSessionId}
}
