import {count, create, getByID, removeMultiple, search, upsert, upsertMultiple} from '@orama/orama'
import {and, eq, inArray, isNotNull} from 'drizzle-orm'
import {chunk, difference, xor} from 'es-toolkit'
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
import type {NativePage} from './session-rows.js'

type SessionSearchDeps = {
  db: ConcivDb
  cwd: string
  home: string | undefined
  harnesses: readonly HarnessAdapter[]
}

type SessionSearch = {
  pages(term: string, page: HarnessListPage): Promise<NativePage[]>
  retitle(harnessKind: string, nativeId: HarnessSessionId, title: string): Promise<void>
}

type Indexed = {harness: HarnessAdapter; history: HarnessHistory}

type Hit = {harnessKind: string; meta: HarnessSessionMeta}

type Listed = {meta: HarnessSessionMeta; title: string}

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

const REFRESH_PAGE = 10

const READ_BATCH = 8

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
  const state: {refreshing: Promise<void> | null} = {refreshing: null}

  const refresh = (): Promise<void> => {
    if (state.refreshing !== null) return state.refreshing
    const running = Promise.all(
      indexed.map((source) =>
        refreshHarness(source).catch((error: unknown) =>
          logError(
            `[core] indexing the ${source.harness.id} sessions for search failed, a later search retries: ${String(error)}`,
          ),
        ),
      ),
    )
      .then(() => undefined)
      .finally(() => {
        state.refreshing = null
      })
    state.refreshing = running
    return running
  }

  const refreshHarness = async (source: Indexed): Promise<void> => {
    const metas = await listedSessions(source.history, deps)
    const titles = await rowTitles(deps.db, source.harness.id, metas)
    const listed = metas.map((meta): Listed => ({meta, title: titles.get(meta.id) ?? meta.derivedTitle}))
    const listedIds = listed.map(({meta}) => documentIdOf(source.harness.id, meta.id))
    await removeMultiple(index, difference(await documentIdsOf(source), listedIds))
    const now = Date.now()
    for (const batch of chunk(listed, READ_BATCH)) {
      await upsertMultiple(index, await Promise.all(batch.map((entry) => documentOf(source, entry, now))))
    }
    const mismatched = xor(await documentIdsOf(source), listedIds)
    if (mismatched.length > 0) {
      logError(
        `[core] the ${source.harness.id} search index and its session list disagree on: ${mismatched.join(', ')}`,
      )
    }
  }

  const documentIdsOf = async (source: Indexed): Promise<string[]> => {
    const found = await search(index, {where: {harness: {eq: source.harness.id}}, limit: count(index)})
    return found.hits.map((hit) => hit.id)
  }

  const documentOf = async (source: Indexed, entry: Listed, now: number): Promise<SearchDocument> => {
    const id = documentIdOf(source.harness.id, entry.meta.id)
    const current = getByID(index, id)
    const fields = {
      id,
      harness: source.harness.id,
      title: entry.title,
      updatedAt: entry.meta.updatedAt,
      sizeBytes: entry.meta.sizeBytes,
    }
    const fresh = current !== undefined && current.read && current.readUpdatedAt === entry.meta.updatedAt
    const throttled = current !== undefined && current.read && now - current.readAt < LIVE_REINDEX_MS
    if (current !== undefined && (fresh || throttled)) {
      return SearchDocumentSchema.parse({
        ...fields,
        body: current.body,
        read: true,
        readAt: current.readAt,
        readUpdatedAt: current.readUpdatedAt,
      })
    }
    const text = await source.history.messages(deps.cwd, entry.meta.id, deps.home).then(
      (messages) => ({body: textOf(messages), read: true}),
      (error: unknown) => {
        if (current?.read !== false) {
          logError(
            `[core] reading the ${source.harness.id} session ${entry.meta.id} for search failed, it is found by its title until a later search reads it: ${String(error)}`,
          )
        }
        return {body: '', read: false}
      },
    )
    return SearchDocumentSchema.parse({...fields, ...text, readAt: now, readUpdatedAt: entry.meta.updatedAt})
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
    async pages(term, page) {
      await refresh()
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
    const listed = await history.list(deps.cwd, {after, limit: REFRESH_PAGE}, deps.home)
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
