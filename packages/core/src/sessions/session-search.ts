import {count, create, getByID, remove, search, upsert, upsertMultiple} from '@orama/orama'
import {and, eq, inArray, isNotNull} from 'drizzle-orm'
import {chunk, uniqBy} from 'es-toolkit'
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

type Hit = {indexed: Indexed; nativeId: HarnessSessionId; documentId: string; cursor: HarnessListCursor}

type Entry = {nativeId: HarnessSessionId; title: string; updatedAt: number}

const SearchDocumentSchema = z.object({
  id: z.string(),
  harness: z.string(),
  title: z.string().catch(''),
  body: z.string().catch(''),
  updatedAt: z.number().catch(0),
  read: z.boolean(),
})

type SearchDocument = z.infer<typeof SearchDocumentSchema>

const REFRESH_PAGE = 10

const READ_BATCH = 8

const TYPO_MIN_LENGTH = 4

export function createSessionSearch(deps: SessionSearchDeps): SessionSearch {
  const index = create({
    schema: {harness: 'enum', title: 'string', body: 'string', updatedAt: 'number', read: 'boolean'},
  })
  const indexed = deps.harnesses.flatMap((harness): Indexed[] =>
    harness.capabilities.transcriptHistory && harness.history !== undefined
      ? [{harness, history: harness.history}]
      : [],
  )
  const watermarks = new Map<string, number>()
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
    const watermark = watermarks.get(source.harness.id) ?? Number.NEGATIVE_INFINITY
    const changed = await changedSince(source.history, deps, watermark)
    const titles = await rowTitles(deps.db, source.harness.id, changed)
    const listed = changed.map((meta): Entry => ({
      nativeId: meta.id,
      title: titles.get(meta.id) ?? meta.derivedTitle,
      updatedAt: meta.updatedAt,
    }))
    const entries = uniqBy([...listed, ...(await unreadEntries(source))], (entry) => entry.nativeId)
    for (const batch of chunk(entries, READ_BATCH)) {
      await upsertMultiple(index, await Promise.all(batch.map((entry) => documentOf(source, entry))))
    }
    const missing = listed.filter(
      (entry) => getByID(index, documentIdOf(source.harness.id, entry.nativeId)) === undefined,
    )
    if (missing.length > 0) {
      logError(
        `[core] the search index is missing ${missing.length} listed ${source.harness.id} sessions: ${missing.map((entry) => entry.nativeId).join(', ')}`,
      )
    }
    if (listed.length > 0) {
      watermarks.set(source.harness.id, Math.max(watermark, ...listed.map((entry) => entry.updatedAt)))
    }
  }

  const unreadEntries = async (source: Indexed): Promise<Entry[]> => {
    const unread = await search(index, {
      where: {harness: {eq: source.harness.id}, read: false},
      limit: count(index),
    })
    return unread.hits.flatMap((hit) => {
      const nativeId = HarnessSessionId.safeParse(hit.id.slice(source.harness.id.length + 1))
      return nativeId.success
        ? [{nativeId: nativeId.data, title: hit.document.title, updatedAt: hit.document.updatedAt}]
        : []
    })
  }

  const documentOf = async (source: Indexed, entry: Entry): Promise<SearchDocument> => {
    const id = documentIdOf(source.harness.id, entry.nativeId)
    const text = await source.history.messages(deps.cwd, entry.nativeId, deps.home).then(
      (messages) => ({body: textOf(messages), read: true}),
      (error: unknown) => {
        if (getByID(index, id)?.read !== false) {
          logError(
            `[core] reading the ${source.harness.id} session ${entry.nativeId} for search failed, it is found by its title until a later search reads it: ${String(error)}`,
          )
        }
        return {body: '', read: false}
      },
    )
    return SearchDocumentSchema.parse({
      id,
      harness: source.harness.id,
      title: entry.title,
      updatedAt: entry.updatedAt,
      ...text,
    })
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
      const source = indexed.find(({harness}) => harness.id === hit.document.harness)
      if (source === undefined) return []
      const nativeId = HarnessSessionId.safeParse(hit.id.slice(source.harness.id.length + 1))
      if (!nativeId.success) return []
      return [
        {
          indexed: source,
          nativeId: nativeId.data,
          documentId: hit.id,
          cursor: {updatedAt: hit.document.updatedAt, id: nativeId.data},
        },
      ]
    })
  }

  const metaOfHit = async (hit: Hit): Promise<{harnessKind: string; meta: HarnessSessionMeta} | null> => {
    const read = await hit.indexed.history.meta(deps.cwd, hit.nativeId, deps.home).then(
      (meta) => ({meta}),
      (error: unknown) => {
        logError(
          `[core] reading the ${hit.indexed.harness.id} session ${hit.nativeId} for a search page failed: ${String(error)}`,
        )
        return null
      },
    )
    if (read === null) return null
    if (read.meta !== null) return {harnessKind: hit.indexed.harness.id, meta: read.meta}
    await remove(index, hit.documentId)
    return null
  }

  return {
    async pages(term, page) {
      await refresh()
      const paged = pageAfter(await hitsOf(term, page.after, page.limit), page, (hit) => hit.cursor)
      const found = (await Promise.all(paged.items.map(metaOfHit))).filter((hit) => hit !== null)
      return indexed.map(({harness}) => ({
        harnessKind: harness.id,
        page: {
          sessions: found.filter((hit) => hit.harnessKind === harness.id).map((hit) => hit.meta),
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

async function changedSince(
  history: HarnessHistory,
  deps: SessionSearchDeps,
  watermark: number,
): Promise<HarnessSessionMeta[]> {
  const collected: HarnessSessionMeta[] = []
  const walk = async (after: HarnessListCursor | null): Promise<HarnessSessionMeta[]> => {
    const listed = await history.list(deps.cwd, {after, limit: REFRESH_PAGE}, deps.home)
    const newer = listed.sessions.filter((meta) => meta.updatedAt > watermark)
    collected.push(...newer)
    const reachedWatermark = newer.length < listed.sessions.length
    return reachedWatermark || listed.next === null ? collected : walk(listed.next)
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
