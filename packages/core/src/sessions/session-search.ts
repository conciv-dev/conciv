import {count, create, getByID, removeMultiple, search, upsert, upsertMultiple} from '@orama/orama'
import {and, eq, inArray, isNotNull} from 'drizzle-orm'
import {difference, sortBy, xor} from 'es-toolkit'
import {setImmediate as yieldToRequests} from 'node:timers/promises'
import {EventPublisher} from '@orpc/server'
import {AsyncQueuer} from '@tanstack/pacer'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {
  HarnessHistory,
  HarnessListCursor,
  HarnessListPage,
  HarnessSessionMeta,
} from '@conciv/protocol/harness-types'
import type {HarnessAdapter} from '@conciv/harness'
import {pageAfter} from '@conciv/harness/page'
import {sessions, type ConcivDb} from '@conciv/db'
import {logError} from '../lib/debug.js'
import type {SessionsChange} from '@conciv/contract'
import type {NativePage} from './session-rows.js'

type SessionSearchDeps = {
  db: ConcivDb
  cwd: string
  harnesses: readonly HarnessAdapter[]
}

type SessionSearch = {
  listed(): void
  changes(signal: AbortSignal | undefined): AsyncIteratorObject<SessionsChange, unknown, void>
  pages(term: string, page: HarnessListPage): Promise<NativePage[]>
  retitle(harnessKind: string, nativeId: HarnessSessionId, title: string): Promise<void>
}

type Indexed = {harness: HarnessAdapter; history: HarnessHistory}

type Hit = {harnessKind: string; meta: HarnessSessionMeta}

type Listed = {source: Indexed; meta: HarnessSessionMeta; title: string}

type TitlePass = {changed: boolean; unread: Listed[]}

const SearchDocumentSchema = z.object({
  id: z.string(),
  harness: z.string(),
  title: z.string().catch(''),
  body: z.string().catch(''),
  updatedAt: z.number().catch(0),
  sizeBytes: z.number().optional().catch(undefined),
  read: z.boolean(),
  readAt: z.number(),
  readUpdatedAt: z.number(),
})

type SearchDocument = z.infer<typeof SearchDocumentSchema>

const REFRESH_PAGE = Number.MAX_SAFE_INTEGER

const TYPO_MIN_LENGTH = 4

const LIVE_REINDEX_MS = 30_000

export function createSessionSearch(deps: SessionSearchDeps): SessionSearch {
  const index = create({
    schema: {
      harness: 'enum',
      title: 'string',
      body: 'string',
      updatedAt: 'number',
      sizeBytes: 'number',
      read: 'boolean',
      readAt: 'number',
      readUpdatedAt: 'number',
    },
  })
  const indexed = deps.harnesses.flatMap((harness): Indexed[] =>
    harness.capabilities.transcriptHistory && harness.history !== undefined
      ? [{harness, history: harness.history}]
      : [],
  )
  const state: {started: boolean} = {started: false}
  const publisher = new EventPublisher<{indexed: SessionsChange}>()

  const rebuild = async (): Promise<void> => {
    const passes = await Promise.all(indexed.map((source) => titlePass(source)))
    if (passes.some((pass) => pass.changed)) publisher.publish('indexed', {reason: 'indexed'})
    if (await textPass(passes.flatMap((pass) => pass.unread))) publisher.publish('indexed', {reason: 'indexed'})
  }

  const refreshes = new AsyncQueuer<'refresh'>(rebuild, {
    concurrency: 1,
    maxSize: 1,
    started: true,
    onError: (error) =>
      logError(`[core] indexing the sessions for search failed, a later search retries: ${String(error)}`),
  })

  const refresh = (): void => {
    refreshes.addItem('refresh')
  }

  const titlePass = async (source: Indexed): Promise<TitlePass> => {
    try {
      const metas = await listedSessions(source.history, deps)
      const titles = await rowTitles(deps.db, source.harness.id, metas)
      const listed = metas.map((meta): Listed => ({source, meta, title: titles.get(meta.id) ?? meta.derivedTitle}))
      const listedIds = listed.map(({meta}) => documentIdOf(source.harness.id, meta.id))
      const gone = difference(await documentIdsOf(source), listedIds)
      await removeMultiple(index, gone)
      const retitled = listed.filter((entry) => !sameListing(currentOf(entry), entry))
      await upsertMultiple(index, retitled.map(titleDocumentOf))
      const mismatched = xor(await documentIdsOf(source), listedIds)
      if (mismatched.length > 0) {
        logError(
          `[core] the ${source.harness.id} search index and its session list disagree on: ${mismatched.join(', ')}`,
        )
      }
      return {changed: gone.length > 0 || retitled.length > 0, unread: listed.filter(unreadNow)}
    } catch (error) {
      logError(
        `[core] indexing the ${source.harness.id} sessions for search failed, a later search retries: ${String(error)}`,
      )
      return {changed: false, unread: []}
    }
  }

  const textPass = async (unread: Listed[]): Promise<boolean> => {
    const ordered = sortBy(unread, [(entry) => entry.meta.sizeBytes ?? 0])
    for (const entry of ordered) {
      const document = await textDocumentOf(entry, Date.now())
      await yieldToRequests()
      await upsert(index, document)
    }
    return ordered.length > 0
  }

  const currentOf = (entry: Listed) => getByID(index, documentIdOf(entry.source.harness.id, entry.meta.id))

  const unreadNow = (entry: Listed): boolean => {
    const current = currentOf(entry)
    if (current === undefined || !current.read) return true
    if (current.readUpdatedAt === entry.meta.updatedAt) return false
    return Date.now() - current.readAt >= LIVE_REINDEX_MS
  }

  const titleDocumentOf = (entry: Listed): SearchDocument => {
    const current = currentOf(entry)
    return SearchDocumentSchema.parse({
      ...listingOf(entry),
      body: current?.body ?? '',
      read: current?.read ?? false,
      readAt: current?.readAt ?? 0,
      readUpdatedAt: current?.readUpdatedAt ?? 0,
    })
  }

  const textDocumentOf = async (entry: Listed, now: number): Promise<SearchDocument> => {
    const current = currentOf(entry)
    const text = await entry.source.history.messages(deps.cwd, entry.meta.id).then(
      (messages) => ({body: textOf(messages), read: true}),
      (error: unknown) => {
        if (current === undefined || current.read || current.readAt === 0) {
          logError(
            `[core] reading the ${entry.source.harness.id} session ${entry.meta.id} for search failed, it is found by its title until a later search reads it: ${String(error)}`,
          )
        }
        return {body: current?.body ?? '', read: false}
      },
    )
    return SearchDocumentSchema.parse({...listingOf(entry), ...text, readAt: now, readUpdatedAt: entry.meta.updatedAt})
  }

  const documentIdsOf = async (source: Indexed): Promise<string[]> => {
    const found = await search(index, {where: {harness: {eq: source.harness.id}}, limit: count(index)})
    return found.hits.map((hit) => hit.id)
  }

  const hitsOf = async (term: string, after: HarnessListCursor | null, limit: number): Promise<Hit[]> => {
    const tolerance = typoTolerance(term)
    const tied =
      after === null
        ? 0
        : (
            await search(index, {
              term,
              properties: ['title', 'body'],
              tolerance,
              threshold: 0,
              where: {updatedAt: {eq: after.updatedAt}},
              limit: 0,
            })
          ).count
    const found = await search(index, {
      term,
      properties: ['title', 'body'],
      tolerance,
      threshold: 0,
      where: after === null ? undefined : {updatedAt: {lte: after.updatedAt}},
      sortBy: {property: 'updatedAt', order: 'DESC'},
      limit: limit + 1 + tied,
    })
    return found.hits.flatMap((hit) => {
      const harness = indexed.find((source) => source.harness.id === hit.document.harness)?.harness
      if (harness === undefined) return []
      const nativeId = HarnessSessionId.safeParse(hit.id.slice(harness.id.length + 1))
      if (!nativeId.success) return []
      return [
        {
          harnessKind: harness.id,
          meta: {
            id: nativeId.data,
            derivedTitle: hit.document.title,
            updatedAt: hit.document.updatedAt,
            sizeBytes: hit.document.sizeBytes,
          },
        },
      ]
    })
  }

  return {
    listed() {
      if (state.started) return
      state.started = true
      setImmediate(refresh)
    },
    changes(signal) {
      return publisher.subscribe('indexed', {signal})
    },
    async pages(term, page) {
      if (state.started) refresh()
      const paged = pageAfter(await hitsOf(term, page.after, page.limit), page, (hit) => ({
        updatedAt: hit.meta.updatedAt,
        id: hit.meta.id,
      }))
      return indexed.map(({harness}) => ({
        harnessKind: harness.id,
        page: {
          sessions: paged.items.filter((hit) => hit.harnessKind === harness.id).map((hit) => hit.meta),
          next: paged.next,
        },
      }))
    },
    async retitle(harnessKind, nativeId, title) {
      const documentId = documentIdOf(harnessKind, nativeId)
      const current = getByID(index, documentId)
      if (current === undefined) return
      await upsert(index, {...current, id: documentId, title})
    },
  }
}

async function listedSessions(history: HarnessHistory, deps: SessionSearchDeps): Promise<HarnessSessionMeta[]> {
  const collected: HarnessSessionMeta[] = []
  const walk = async (after: HarnessListCursor | null): Promise<HarnessSessionMeta[]> => {
    const listed = await history.list(deps.cwd, {after, limit: REFRESH_PAGE})
    collected.push(...listed.sessions)
    return listed.next === null ? collected : walk(listed.next)
  }
  return walk(null)
}

async function rowTitles(
  db: ConcivDb,
  harnessKind: string,
  metas: HarnessSessionMeta[],
): Promise<ReadonlyMap<string, string>> {
  const rows = await db
    .select({nativeId: sessions.harnessSessionId, title: sessions.title})
    .from(sessions)
    .where(
      and(
        eq(sessions.harnessKind, harnessKind),
        isNotNull(sessions.title),
        inArray(
          sessions.harnessSessionId,
          metas.map((meta) => meta.id),
        ),
      ),
    )
  return new Map(
    rows.flatMap((row) => (row.nativeId !== null && row.title !== null ? [[row.nativeId, row.title]] : [])),
  )
}

function sameListing(
  current: Pick<SearchDocument, 'updatedAt' | 'title' | 'sizeBytes'> | undefined,
  entry: Listed,
): boolean {
  return (
    current !== undefined &&
    current.updatedAt === entry.meta.updatedAt &&
    current.title === entry.title &&
    current.sizeBytes === entry.meta.sizeBytes
  )
}

function listingOf(entry: Listed): Pick<SearchDocument, 'id' | 'harness' | 'title' | 'updatedAt' | 'sizeBytes'> {
  return {
    id: documentIdOf(entry.source.harness.id, entry.meta.id),
    harness: entry.source.harness.id,
    title: entry.title,
    updatedAt: entry.meta.updatedAt,
    sizeBytes: entry.meta.sizeBytes,
  }
}

function textOf(messages: ChatMessage[]): string {
  return messages
    .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])))
    .join('\n')
}

function typoTolerance(term: string): number {
  const words = term.split(/\s+/).filter((word) => word !== '')
  return words.every((word) => word.length >= TYPO_MIN_LENGTH) ? 1 : 0
}

function documentIdOf(harnessKind: string, nativeId: string): string {
  return `${harnessKind}:${nativeId}`
}
