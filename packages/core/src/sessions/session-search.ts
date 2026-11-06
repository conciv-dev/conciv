import {create, getByID, remove, search, upsert, upsertMultiple} from '@orama/orama'
import {and, eq, inArray, isNotNull} from 'drizzle-orm'
import {chunk} from 'es-toolkit'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
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

const REFRESH_PAGE = 10

const READ_BATCH = 8

const TYPO_MIN_LENGTH = 4

export function createSessionSearch(deps: SessionSearchDeps): SessionSearch {
  const index = create({schema: {harness: 'enum', title: 'string', body: 'string', updatedAt: 'number'}})
  const indexed = deps.harnesses.flatMap((harness): Indexed[] =>
    harness.capabilities.transcriptHistory && harness.history !== undefined
      ? [{harness, history: harness.history}]
      : [],
  )
  const watermarks = new Map<string, number>()
  const state: {refreshing: Promise<void> | null} = {refreshing: null}

  const refresh = (): Promise<void> => {
    if (state.refreshing !== null) return state.refreshing
    const running = Promise.all(indexed.map(refreshHarness))
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
    if (changed.length === 0) return
    const titles = await rowTitles(deps.db, source.harness.id, changed)
    for (const batch of chunk(changed, READ_BATCH)) {
      await upsertMultiple(index, await Promise.all(batch.map((meta) => documentOf(source, deps, meta, titles))))
    }
    watermarks.set(source.harness.id, Math.max(watermark, ...changed.map((meta) => meta.updatedAt)))
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
    const meta = await hit.indexed.history.meta(deps.cwd, hit.nativeId, deps.home)
    if (meta !== null) return {harnessKind: hit.indexed.harness.id, meta}
    await remove(index, hit.documentId)
    return null
  }

  refresh().then(undefined, (error: unknown) =>
    logError(`[core] building the session search index failed, searches retry it: ${String(error)}`),
  )

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

async function documentOf(
  source: Indexed,
  deps: SessionSearchDeps,
  meta: HarnessSessionMeta,
  titles: ReadonlyMap<string, string>,
): Promise<{id: string; harness: string; title: string; body: string; updatedAt: number}> {
  const messages = await source.history.messages(deps.cwd, meta.id, deps.home)
  const body = messages
    .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])))
    .join('\n')
  return {
    id: documentIdOf(source.harness.id, meta.id),
    harness: source.harness.id,
    title: titles.get(meta.id) ?? meta.derivedTitle,
    body,
    updatedAt: meta.updatedAt,
  }
}

function typoTolerance(term: string): number {
  const words = term.split(/\s+/).filter((word) => word !== '')
  return words.every((word) => word.length >= TYPO_MIN_LENGTH) ? 1 : 0
}

function documentIdOf(harnessKind: string, nativeId: string): string {
  return `${harnessKind}:${nativeId}`
}
