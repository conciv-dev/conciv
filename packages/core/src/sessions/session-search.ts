import {MessageChannel, Worker} from 'node:worker_threads'
import {extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {and, eq, inArray, isNotNull} from 'drizzle-orm'
import {difference, keyBy, sortBy, xor} from 'es-toolkit'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/message-port'
import {EventPublisher, type RouterClient} from '@orpc/server'
import {AsyncQueuer} from '@tanstack/pacer'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {
  HarnessHistory,
  HarnessListCursor,
  HarnessListPage,
  HarnessListScope,
  HarnessSessionMeta,
} from '@conciv/protocol/harness-types'
import type {HarnessAdapter} from '@conciv/harness'
import {sameCwd} from '@conciv/harness/cwd'
import {pageAfter} from '@conciv/harness/page'
import {sessions, type ConcivDb} from '@conciv/db'
import {logError} from '../lib/debug.js'
import type {SessionsChange} from '@conciv/contract'
import type {Found, NativePage} from './session-rows.js'
import type {SearchIndexRouter} from './search-index-worker.js'

type SessionSearchDeps = {
  db: ConcivDb
  cwd: string
  harnesses: readonly HarnessAdapter[]
}

type SessionSearch = {
  listed(): void
  changes(signal: AbortSignal | undefined): AsyncIteratorObject<SessionsChange, unknown, void>
  pages(term: string, page: HarnessListPage, everywhere: boolean): Promise<NativePage[]>
  retitle(harnessKind: string, nativeId: HarnessSessionId, title: string): Promise<void>
  dispose(): Promise<void>
}

type Indexed = {harness: HarnessAdapter; history: HarnessHistory}

type Hit = {harnessKind: string; meta: HarnessSessionMeta; found: Found}

type SearchIndex = RouterClient<SearchIndexRouter>

type IndexState = Awaited<ReturnType<SearchIndex['states']>>[number]

type Listing = Parameters<SearchIndex['read']>[0]['listing']

type Listed = {source: Indexed; meta: HarnessSessionMeta; cwd: string; title: string; current: IndexState | undefined}

type TitlePass = {changed: boolean; unread: Listed[]}

type Running = {index: SearchIndex; worker: Worker; stopped: AbortController}

const REFRESH_PAGE = Number.MAX_SAFE_INTEGER

const TYPO_MIN_LENGTH = 4

const LIVE_REINDEX_MS = 30_000

export function createSessionSearch(deps: SessionSearchDeps): SessionSearch {
  const indexed = deps.harnesses.flatMap((harness): Indexed[] =>
    harness.capabilities.transcriptHistory && harness.history !== undefined
      ? [{harness, history: harness.history}]
      : [],
  )
  const state: {running: Running | null; version: number; scopes: HarnessListScope[]} = {
    running: null,
    version: Date.now(),
    scopes: [{cwd: deps.cwd}],
  }
  const publisher = new EventPublisher<{indexed: SessionsChange}>()

  const indexedChanged = (): void => {
    state.version += 1
    publisher.publish('indexed', {version: state.version})
  }

  const rebuild = async (): Promise<void> => {
    if (state.running === null) return
    const running = state.running
    await state.scopes.reduce<Promise<void>>(async (previous, scope) => {
      await previous
      await indexScope(running, scope)
    }, Promise.resolve())
  }

  const indexScope = async (running: Running, scope: HarnessListScope): Promise<void> => {
    const passes = await Promise.all(indexed.map((source) => titlePass(running, source, scope)))
    if (passes.some((pass) => pass.changed)) indexedChanged()
    if (
      await textPass(
        running,
        passes.flatMap((pass) => pass.unread),
      )
    )
      indexedChanged()
  }

  const refreshes = new AsyncQueuer<'refresh'>(rebuild, {
    concurrency: 1,
    maxSize: 1,
    started: true,
    onError: (error) => {
      if (state.running?.stopped.signal.aborted) return
      logError(`[core] indexing the sessions for search failed, a later search retries: ${String(error)}`)
    },
  })

  const refresh = (): void => {
    refreshes.addItem('refresh')
  }

  const titlePass = async (running: Running, source: Indexed, scope: HarnessListScope): Promise<TitlePass> => {
    const signal = running.stopped.signal
    const inProject = 'cwd' in scope
    const owned = (cwd: string): boolean => (cwd === deps.cwd) === inProject
    const statesOwned = async () =>
      (await running.index.states({harness: source.harness.id}, {signal})).filter((row) => owned(row.cwd))
    try {
      const metas = (await listedSessions(source.history, scope)).filter(
        (meta) => inProject || !sameCwd(meta.cwd, deps.cwd),
      )
      const titles = await rowTitles(deps.db, source.harness.id, metas)
      const states = keyBy(await statesOwned(), (row) => row.id)
      const listed = metas.map((meta): Listed => {
        const id = documentIdOf(source.harness.id, meta.id)
        const cwd = inProject ? deps.cwd : meta.cwd
        return {source, meta, cwd, title: titles.get(meta.id) ?? meta.derivedTitle, current: states[id]}
      })
      const listedIds = listed.map(({meta}) => documentIdOf(source.harness.id, meta.id))
      const gone = difference(Object.keys(states), listedIds)
      await running.index.remove({ids: gone}, {signal})
      const retitled = listed.filter((entry) => !sameListing(entry.current, entry))
      await running.index.list({listings: retitled.map(listingOf)}, {signal})
      const indexedIds = (await statesOwned()).map((row) => row.id)
      const mismatched = xor(indexedIds, listedIds)
      if (mismatched.length > 0) {
        logError(
          `[core] the ${source.harness.id} search index and its session list disagree on: ${mismatched.join(', ')}`,
        )
      }
      return {changed: gone.length > 0 || retitled.length > 0, unread: listed.filter(unreadNow)}
    } catch (error) {
      if (!signal.aborted) {
        logError(
          `[core] indexing the ${source.harness.id} sessions for search failed, a later search retries: ${String(error)}`,
        )
      }
      return {changed: false, unread: []}
    }
  }

  const textPass = async (running: Running, unread: Listed[]): Promise<boolean> => {
    const ordered = sortBy(unread, [(entry) => entry.meta.sizeBytes ?? 0])
    return ordered.reduce<Promise<boolean>>(async (previous, entry) => {
      const changed = await previous
      return (await readInto(running, entry, Date.now())) || changed
    }, Promise.resolve(false))
  }

  const readInto = async (running: Running, entry: Listed, now: number): Promise<boolean> => {
    const current = entry.current
    const text = await entry.source.history.messages(entry.cwd, entry.meta.id).then(textOf, (error: unknown) => {
      if (current === undefined || current.read || current.readAt === 0) {
        logError(
          `[core] reading the ${entry.source.harness.id} session ${entry.meta.id} for search failed, it is found by its title until a later search reads it: ${String(error)}`,
        )
      }
      return null
    })
    await running.index.read(
      {listing: listingOf(entry), text, readAt: now, readUpdatedAt: entry.meta.updatedAt},
      {signal: running.stopped.signal},
    )
    return text !== null
  }

  const hitsOf = async (
    running: Running,
    term: string,
    after: HarnessListCursor | null,
    limit: number,
    everywhere: boolean,
  ): Promise<Hit[]> => {
    const found = await running.index.search(
      {term, tolerance: typoTolerance(term), cwd: everywhere ? null : deps.cwd, after, limit},
      {signal: running.stopped.signal},
    )
    return found.flatMap((hit) => {
      const harness = indexed.find((source) => source.harness.id === hit.harness)?.harness
      if (harness === undefined) return []
      const nativeId = HarnessSessionId.safeParse(hit.id.slice(harness.id.length + 1))
      if (!nativeId.success) return []
      return [
        {
          harnessKind: harness.id,
          meta: {
            id: nativeId.data,
            cwd: hit.cwd,
            derivedTitle: hit.title,
            updatedAt: hit.updatedAt,
            sizeBytes: hit.sizeBytes,
          },
          found: {excerpt: hit.excerpt, matched: hit.matched},
        },
      ]
    })
  }

  return {
    listed() {
      if (state.running !== null) return
      const running = startIndex(() => {
        running.stopped.abort()
        state.running = null
      })
      state.running = running
      setImmediate(refresh)
    },
    async *changes(signal) {
      const later = publisher.subscribe('indexed', {signal})
      yield {version: state.version}
      yield* later
    },
    async pages(term, page, everywhere) {
      if (state.running === null)
        return indexed.map(({harness}) => ({harnessKind: harness.id, page: {sessions: [], next: null}}))
      if (everywhere && !state.scopes.some((scope) => 'everywhere' in scope)) state.scopes.push({everywhere: true})
      refresh()
      const found = await hitsOf(state.running, term, page.after, page.limit, everywhere)
      const paged = pageAfter(found, page, (hit) => ({
        updatedAt: hit.meta.updatedAt,
        id: hit.meta.id,
      }))
      return indexed.map(({harness}) => {
        const hits = paged.items.filter((hit) => hit.harnessKind === harness.id)
        return {
          harnessKind: harness.id,
          page: {sessions: hits.map((hit) => hit.meta), next: paged.next},
          found: new Map(hits.map((hit) => [hit.meta.id, hit.found])),
        }
      })
    },
    async retitle(harnessKind, nativeId, title) {
      if (state.running === null) return
      await state.running.index.rename(
        {id: documentIdOf(harnessKind, nativeId), title},
        {signal: state.running.stopped.signal},
      )
    },
    async dispose() {
      refreshes.stop()
      refreshes.clear()
      if (state.running === null) return
      state.running.stopped.abort()
      await state.running.worker.terminate()
    },
  }
}

function startIndex(exited: () => void): Running {
  const channel = new MessageChannel()
  const worker = new Worker(workerUrl(), {workerData: {port: channel.port2}, transferList: [channel.port2]})
  worker.on('error', (error) => logError(`[core] the session search index worker failed: ${String(error)}`))
  worker.on('exit', exited)
  worker.unref()
  channel.port1.unref()
  const index: SearchIndex = createORPCClient(new RPCLink({port: channel.port1}))
  channel.port1.start()
  return {index, worker, stopped: new AbortController()}
}

function workerUrl(): URL {
  return new URL(`./search-index-worker${extname(fileURLToPath(import.meta.url))}`, import.meta.url)
}

function unreadNow(entry: Listed): boolean {
  const current = entry.current
  if (current === undefined || !current.read) return true
  if (current.readUpdatedAt === entry.meta.updatedAt) return false
  return Date.now() - current.readAt >= LIVE_REINDEX_MS
}

async function listedSessions(history: HarnessHistory, scope: HarnessListScope): Promise<HarnessSessionMeta[]> {
  const collected: HarnessSessionMeta[] = []
  const walk = async (after: HarnessListCursor | null): Promise<HarnessSessionMeta[]> => {
    const listed = await history.list(scope, {after, limit: REFRESH_PAGE})
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

function sameListing(current: IndexState | undefined, entry: Listed): boolean {
  return (
    current !== undefined &&
    current.cwd === entry.cwd &&
    current.updatedAt === entry.meta.updatedAt &&
    current.title === entry.title &&
    current.sizeBytes === entry.meta.sizeBytes
  )
}

function listingOf(entry: Listed): Listing {
  return {
    id: documentIdOf(entry.source.harness.id, entry.meta.id),
    harness: entry.source.harness.id,
    cwd: entry.cwd,
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
