import {and, asc, desc, eq, gte, isNotNull, lt, lte, max, sql} from 'drizzle-orm'
import {Effect} from 'effect'
import type {MessagePage} from '@tanstack/ai-persistence'
import type {ModelMessage} from '@conciv/types/chat-message-types'
import type {ChatStores} from './chat-server.js'
import {chatMessages, chatMetadata, chatRuns} from '../db/run-schema.js'
import {sessions} from '@conciv/backend-app-api/core/session/sql'
import type {ConcivDb} from '../db/connection.js'
import {aiErrors} from '@conciv/errors'

type RunRecord = NonNullable<Awaited<ReturnType<ChatStores['runs']['get']>>>

type RunPatch = Parameters<ChatStores['runs']['update']>[1]

function mapRun(row: typeof chatRuns.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt === null ? {} : {finishedAt: row.finishedAt}),
    ...(row.error === null
      ? {}
      : {error: {message: row.error, ...(row.errorCode === null ? {} : {code: row.errorCode})}}),
    ...(row.usageJson === null ? {} : {usage: row.usageJson}),
    ...(row.sandboxKey === null ? {} : {sandboxKey: row.sandboxKey}),
    ...(row.detachedSince === null ? {} : {detachedSince: row.detachedSince}),
    ...(row.cancelRequested === null ? {} : {cancelRequested: row.cancelRequested}),
    ...(row.driverEpoch === null ? {} : {driverEpoch: row.driverEpoch}),
  }
}

type RunColumns = Partial<typeof chatRuns.$inferInsert>

function outcomeColumns(patch: RunPatch): RunColumns {
  return {
    ...(patch.status === undefined ? {} : {status: patch.status}),
    ...(patch.finishedAt === undefined ? {} : {finishedAt: patch.finishedAt}),
    ...(patch.error === undefined ? {} : {error: patch.error.message, errorCode: patch.error.code ?? null}),
    ...(patch.usage === undefined ? {} : {usageJson: patch.usage}),
  }
}

function durableColumns(patch: RunPatch): RunColumns {
  return {
    ...('sandboxKey' in patch ? {sandboxKey: patch.sandboxKey ?? null} : {}),
    ...('detachedSince' in patch ? {detachedSince: patch.detachedSince ?? null} : {}),
    ...('cancelRequested' in patch ? {cancelRequested: patch.cancelRequested ?? null} : {}),
    ...('driverEpoch' in patch ? {driverEpoch: patch.driverEpoch ?? null} : {}),
  }
}

type ThreadWindow = {limit?: number; before?: string}

const metadataAt = (namespace: string, key: string) =>
  and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key))

type StoreOptions = {
  readHarness: (threadId: string) => Promise<string>
  saved?: (threadId: string, messages: readonly ModelMessage[], at: number) => Promise<void>
}

function newestAt(createdAts: readonly {createdAt: unknown}[]): number {
  const times = createdAts.flatMap(({createdAt}) => (typeof createdAt === 'string' ? [Date.parse(createdAt)] : []))
  const known = times.filter(Number.isFinite)
  return known.length === 0 ? Date.now() : Math.max(...known)
}

export function drizzleChatStores(db: ConcivDb, opts: StoreOptions): ChatStores {
  const get = async (runId: string): Promise<RunRecord | null> => {
    const rows = await Effect.runPromise(db.select().from(chatRuns).where(eq(chatRuns.runId, runId)).limit(1))
    const row = rows[0]
    return row === undefined ? null : mapRun(row)
  }
  async function wholeThread(threadId: string): Promise<ModelMessage[]> {
    const rows = await Effect.runPromise(
      db
        .select({messageJson: chatMessages.messageJson})
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(asc(chatMessages.position)),
    )
    return rows.map((row) => row.messageJson)
  }
  async function windowEnd(threadId: string, before: string | undefined): Promise<number | null> {
    if (before === undefined) {
      const newest = await Effect.runPromise(
        db
          .select({position: max(chatMessages.position)})
          .from(chatMessages)
          .where(eq(chatMessages.threadId, threadId)),
      )
      return (newest[0]?.position ?? -1) + 1
    }
    const rows = await Effect.runPromise(
      db
        .select({position: chatMessages.position})
        .from(chatMessages)
        .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.messageId, before)))
        .limit(1),
    )
    return rows[0]?.position ?? null
  }
  async function turnStartAtOrBefore(threadId: string, from: number) {
    const rows = await Effect.runPromise(
      db
        .select({position: chatMessages.position, messageId: chatMessages.messageId})
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, threadId),
            eq(chatMessages.role, 'user'),
            isNotNull(chatMessages.messageId),
            lte(chatMessages.position, from),
          ),
        )
        .orderBy(desc(chatMessages.position))
        .limit(1),
    )
    return rows[0] ?? {position: 0, messageId: null}
  }
  async function threadWindow(threadId: string, limit: number, before?: string): Promise<MessagePage> {
    const end = await windowEnd(threadId, before)
    if (end === null) return {messages: [], truncated: false}
    const start = await turnStartAtOrBefore(threadId, Math.max(end - limit, 0))
    const rows = await Effect.runPromise(
      db
        .select({messageJson: chatMessages.messageJson})
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, threadId),
            gte(chatMessages.position, start.position),
            lt(chatMessages.position, end),
          ),
        )
        .orderBy(asc(chatMessages.position)),
    )
    const messages = rows.map((row) => row.messageJson)
    if (start.position === 0 || start.messageId === null) return {messages, truncated: false}
    return {messages, truncated: true, cursor: start.messageId}
  }
  function loadThread(threadId: string): Promise<ModelMessage[]>
  function loadThread(threadId: string, window: ThreadWindow): Promise<ModelMessage[] | MessagePage>
  function loadThread(threadId: string, window?: ThreadWindow): Promise<ModelMessage[] | MessagePage> {
    if (window?.limit === undefined) return wholeThread(threadId)
    return threadWindow(threadId, window.limit, window.before)
  }
  async function loadMessage(threadId: string, messageId: string): Promise<ModelMessage | null> {
    const rows = await Effect.runPromise(
      db
        .select({messageJson: chatMessages.messageJson})
        .from(chatMessages)
        .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.messageId, messageId)))
        .limit(1),
    )
    return rows[0]?.messageJson ?? null
  }
  return {
    messages: {
      loadThread,
      loadMessage,
      saveThread: async (threadId, messages) => {
        const changed = await Effect.runPromise(
          db.transaction((tx) =>
            Effect.gen(function* () {
              const tombstone = yield* tx
                .select({id: sessions.id})
                .from(sessions)
                .where(and(eq(sessions.id, threadId), isNotNull(sessions.deletedAt)))
              if (tombstone.length > 0) return null
              const dropped = yield* tx
                .delete(chatMessages)
                .where(and(eq(chatMessages.threadId, threadId), gte(chatMessages.position, messages.length)))
              const written = yield* tx.all<{createdAt: unknown}>(
                sql`INSERT INTO ${chatMessages} (thread_id, position, message_id, role, message_json) SELECT ${threadId}, CAST(key AS INTEGER), json_extract(value, '$.id'), json_extract(value, '$.role'), value FROM json_each(${JSON.stringify(messages)}) WHERE true ON CONFLICT (thread_id, position) DO UPDATE SET message_id = excluded.message_id, role = excluded.role, message_json = excluded.message_json WHERE message_json IS NOT excluded.message_json RETURNING json_extract(message_json, '$.createdAt') AS createdAt`,
              )
              return Number(dropped.changes) > 0 || written.length > 0 ? written : null
            }),
          ),
        )
        if (changed !== null) await opts.saved?.(threadId, messages, newestAt(changed))
      },
    },
    runs: {
      get,
      createOrResume: async ({runId, threadId, startedAt, status}) => {
        const harnessId = await opts.readHarness(threadId)
        await Effect.runPromise(
          db
            .insert(chatRuns)
            .values({runId, threadId, harnessId, status: status ?? 'running', startedAt})
            .onConflictDoNothing({target: chatRuns.runId}),
        )
        const stored = await get(runId)
        if (stored === null) throw aiErrors.RUN_NOT_STORED({runId})
        return stored
      },
      update: async (runId, patch) => {
        const set = {...outcomeColumns(patch), ...durableColumns(patch)}
        if (Object.keys(set).length === 0) return
        await Effect.runPromise(db.update(chatRuns).set(set).where(eq(chatRuns.runId, runId)))
      },
      findActiveRun: async (threadId) => {
        const rows = await Effect.runPromise(
          db
            .select()
            .from(chatRuns)
            .where(and(eq(chatRuns.threadId, threadId), eq(chatRuns.status, 'running')))
            .orderBy(desc(chatRuns.startedAt))
            .limit(1),
        )
        const row = rows[0]
        return row === undefined ? null : mapRun(row)
      },
      listByThread: async (threadId) => {
        const rows = await Effect.runPromise(
          db.select().from(chatRuns).where(eq(chatRuns.threadId, threadId)).orderBy(asc(chatRuns.startedAt)),
        )
        return rows.map(mapRun)
      },
      known: async (runId) =>
        (await Effect.runPromise(db.select().from(chatRuns).where(eq(chatRuns.runId, runId)).get())) !== undefined,
      listRunning: async () => {
        const rows = await Effect.runPromise(db.select().from(chatRuns).where(eq(chatRuns.status, 'running')))
        return rows.map(mapRun)
      },
      listReclaimable: async ({now, ttlMs}) => {
        const rows = await Effect.runPromise(
          db
            .select()
            .from(chatRuns)
            .where(
              and(
                eq(chatRuns.status, 'running'),
                isNotNull(chatRuns.detachedSince),
                lte(chatRuns.detachedSince, now - ttlMs),
              ),
            ),
        )
        return rows.map(mapRun)
      },
    },
    metadata: {
      get: async (namespace, key) => {
        const rows = await Effect.runPromise(
          db.select({valueJson: chatMetadata.valueJson}).from(chatMetadata).where(metadataAt(namespace, key)),
        )
        return rows[0]?.valueJson ?? null
      },
      set: async (namespace, key, value) => {
        if (value === null || value === undefined) throw new TypeError(`cannot store ${String(value)} at ${key}`)
        await Effect.runPromise(
          db
            .insert(chatMetadata)
            .values({namespace, key, valueJson: value})
            .onConflictDoUpdate({target: [chatMetadata.namespace, chatMetadata.key], set: {valueJson: value}}),
        )
      },
      delete: async (namespace, key) => {
        await Effect.runPromise(db.delete(chatMetadata).where(metadataAt(namespace, key)))
      },
    },
  }
}
