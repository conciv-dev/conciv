import {once} from 'node:events'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {MessageChannel, Worker} from 'node:worker_threads'
import {Effect} from 'effect'
import {realpath} from 'node:fs/promises'
import {extname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {and, eq, inArray, isNotNull} from 'drizzle-orm'
import {difference, keyBy, sortBy, uniq, xor, zipObject} from 'es-toolkit'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/message-port'
import {EventPublisher, type RouterClient} from '@orpc/server'
import {AsyncQueuer} from '@tanstack/pacer'
import {inSpan, type Tracer} from '../../ai.js'
import {HarnessSessionId} from '@conciv/types/chat-types'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import type {
  HarnessHistory,
  HarnessListCursor,
  HarnessListPage,
  HarnessListScope,
  HarnessSessionMeta,
} from '@conciv/types/harness-types'
import type {HarnessAdapter} from '@conciv/harness'
import {sameCwd} from '@conciv/harness/cwd'
import {pageAfter} from '@conciv/harness/page'
import {sessions} from '@conciv/backend-app-api/core/session/sql'
import type {ConcivDb} from '../../db/connection.js'
import type {EngineRuntime} from '../lib/logging.js'
import type {SessionsChange} from '@conciv/protocol'
import type {Found, NativePage} from './session-rows.js'
import type {SearchIndexRouter} from './search-index-worker.js'

type SessionSearchDeps = {
  db: ConcivDb
  cwd: string
  harnesses: readonly HarnessAdapter[]
  runtime: EngineRuntime
  tracer: Tracer | undefined
}

type SessionSearch = {
  listed(): void
  changes(signal: AbortSignal | undefined): AsyncIteratorObject<SessionsChange, unknown, void>
  pages(term: string, page: HarnessListPage, everywhere: boolean): Promise<NativePage[]>
  retitle(harnessKind: string, nativeId: HarnessSessionId, title: string): Promise<void>
  cover(cwd: string): void
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
  const state: {
    running: Running | null
    version: number
    scopes: HarnessListScope[]
    everywhere: Promise<void> | null
  } = {
    running: null,
    version: Date.now(),
    scopes: [{cwd: deps.cwd}],
    everywhere: null,
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

  const titlePasses = async (running: Running, scope: HarnessListScope): Promise<TitlePass[]> =>
    indexed.reduce<Promise<TitlePass[]>>(async (previous, source) => {
      const done = await previous
      await nextTurn()
      return [...done, await titlePass(running, source, scope)]
    }, Promise.resolve([]))

  const indexScope = async (running: Running, scope: HarnessListScope): Promise<void> => {
    const passes = await titlePasses(running, scope)
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
      deps.runtime.runFork(
        Effect.logError('[core] indexing the sessions for search failed, a later search retries', {error}),
      )
    },
  })

  const refresh = (): void => {
    refreshes.addItem('refresh')
  }

  const folderScoped = (cwd: string): boolean => state.scopes.some((scope) => 'cwd' in scope && sameCwd(scope.cwd, cwd))

  const titlePass = async (running: Running, source: Indexed, scope: HarnessListScope): Promise<TitlePass> => {
    const signal = running.stopped.signal
    const folder = 'cwd' in scope ? scope.cwd : null
    const scoped =
      folder === null
        ? Promise.all(state.scopes.flatMap((listed) => ('cwd' in listed ? [resolveFolder(listed.cwd)] : [])))
        : null
    const statesOwned = async (known: Record<string, string>) => {
      const rows = await running.index.states({harness: source.harness.id}, {signal})
      if (scoped === null) return rows.filter((row) => row.cwd === folder)
      return (await keepUnscoped(rows, scoped, known)).kept
    }
    try {
      const walked = await listedSessions(source.history, scope)
      const unscoped = scoped === null ? {kept: walked, folders: {}} : await keepUnscoped(walked, scoped, {})
      const metas = unscoped.kept
      const titles = await rowTitles(deps.db, source.harness.id, metas)
      const states = keyBy(await statesOwned(unscoped.folders), (row) => row.id)
      const listed = metas.map((meta): Listed => {
        const id = formatDocumentId(source.harness.id, meta.id)
        const cwd = folder ?? meta.cwd
        return {source, meta, cwd, title: titles.get(meta.id) ?? meta.derivedTitle, current: states[id]}
      })
      const listedIds = listed.map(({meta}) => formatDocumentId(source.harness.id, meta.id))
      const gone = difference(Object.keys(states), listedIds)
      await running.index.remove({ids: gone}, {signal})
      const retitled = listed.filter((entry) => !sameListing(entry.current, entry))
      await running.index.list({listings: retitled.map(buildListing)}, {signal})
      const indexedIds = (await statesOwned(unscoped.folders)).map((row) => row.id)
      const mismatched = xor(indexedIds, listedIds)
      if (mismatched.length > 0) {
        deps.runtime.runFork(
          Effect.logError('[core] the search index and its session list disagree', {
            harness: source.harness.id,
            mismatched,
          }),
        )
      }
      return {changed: gone.length > 0 || retitled.length > 0, unread: listed.filter(unreadNow)}
    } catch (error) {
      if (!signal.aborted) {
        deps.runtime.runFork(
          Effect.logError('[core] indexing the sessions for search failed, a later search retries', {
            harness: source.harness.id,
            error,
          }),
        )
      }
      return {changed: false, unread: []}
    }
  }

  const widenEverywhere = async (running: Running): Promise<void> => {
    const scope: HarnessListScope = {everywhere: true}
    const passes = await titlePasses(running, scope)
    if (!state.scopes.some((listed) => 'everywhere' in listed)) state.scopes.push(scope)
    if (passes.some((pass) => pass.changed)) indexedChanged()
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
    const text = await entry.source.history.messages(entry.cwd, entry.meta.id).then(readText, (error: unknown) => {
      if (current === undefined || current.read || current.readAt === 0) {
        deps.runtime.runFork(
          Effect.logError(
            '[core] reading a session for search failed, it is found by its title until a later search reads it',
            {harness: entry.source.harness.id, nativeId: entry.meta.id, error},
          ),
        )
      }
      return null
    })
    await running.index.read(
      {listing: buildListing(entry), text, readAt: now, readUpdatedAt: entry.meta.updatedAt},
      {signal: running.stopped.signal},
    )
    return text !== null
  }

  const searchHits = async (
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
        state.everywhere = null
      }, deps.runtime)
      state.running = running
      void inSpan(deps.tracer, 'SessionSearch.startWorker', {}, async () => once(running.worker, 'online')).catch(
        (error: unknown) =>
          deps.runtime.runFork(Effect.logError('[core] the session search index worker did not start', {error})),
      )
      setImmediate(refresh)
    },
    async *changes(signal) {
      const later = publisher.subscribe('indexed', {signal})
      yield {version: state.version}
      yield* later
    },
    async pages(term, page, everywhere) {
      const running = state.running
      if (running === null)
        return indexed.map(({harness}) => ({harnessKind: harness.id, page: {sessions: [], next: null}}))
      if (everywhere) await (state.everywhere ??= widenEverywhere(running))
      refresh()
      const found = await searchHits(running, term, page.after, page.limit, everywhere)
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
        {id: formatDocumentId(harnessKind, nativeId), title},
        {signal: state.running.stopped.signal},
      )
    },
    cover(cwd) {
      if (folderScoped(cwd)) return
      state.scopes.push({cwd})
      refresh()
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

function startIndex(exited: () => void, runtime: EngineRuntime): Running {
  const channel = new MessageChannel()
  const worker = new Worker(workerUrl(), {workerData: {port: channel.port2}, transferList: [channel.port2]})
  worker.on('error', (error) =>
    runtime.runFork(Effect.logError('[core] the session search index worker failed', {error})),
  )
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

async function resolveFolder(cwd: string): Promise<string> {
  return realpath(resolve(cwd)).catch(() => resolve(cwd))
}

async function keepUnscoped<Item extends {cwd: string}>(
  items: Item[],
  scoped: Promise<string[]>,
  known: Record<string, string>,
): Promise<{kept: Item[]; folders: Record<string, string>}> {
  const missing = difference(uniq(items.map((item) => item.cwd)), Object.keys(known))
  const folders = {...known, ...zipObject(missing, await Promise.all(missing.map(resolveFolder)))}
  const excluded = await scoped
  return {kept: items.filter((item) => !excluded.includes(folders[item.cwd] ?? resolve(item.cwd))), folders}
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
  const rows = await Effect.runPromise(
    db
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

function buildListing(entry: Listed): Listing {
  return {
    id: formatDocumentId(entry.source.harness.id, entry.meta.id),
    harness: entry.source.harness.id,
    cwd: entry.cwd,
    title: entry.title,
    updatedAt: entry.meta.updatedAt,
    sizeBytes: entry.meta.sizeBytes,
  }
}

function readText(messages: ChatMessage[]): string {
  return messages
    .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])))
    .join('\n')
}

function typoTolerance(term: string): number {
  const words = term.split(/\s+/).filter((word) => word !== '')
  return words.every((word) => word.length >= TYPO_MIN_LENGTH) ? 1 : 0
}

function formatDocumentId(harnessKind: string, nativeId: string): string {
  return `${harnessKind}:${nativeId}`
}
