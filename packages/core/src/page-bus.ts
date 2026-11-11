import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {orderBy} from 'es-toolkit'
import {isPageFailure, pageFailure, type PageOutcome, type PageQuery} from '@conciv/protocol/page-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import {appendPageChange, clearPageChanges, pageChangesFor, type ConcivDb} from '@conciv/db'
import type {PageQueues} from './page-queue.js'

export type ChangeEntry = {
  seq: number
  ts: number
  verb: string
  ref?: string
  selector?: string
  args: Record<string, unknown>
}

export type Journal = {
  append: (sessionId: SessionId, entry: Omit<ChangeEntry, 'seq' | 'ts'>, ts: number) => Promise<ChangeEntry>
  list: (sessionId: SessionId) => Promise<ChangeEntry[]>
  clear: (sessionId: SessionId) => Promise<void>
}

export function makeJournal(db: ConcivDb): Journal {
  return {
    append: (sessionId, entry, ts) => appendPageChange(db, sessionId, entry, ts),
    list: (sessionId) => pageChangesFor(db, sessionId),
    clear: (sessionId) => clearPageChanges(db, sessionId),
  }
}

type Pending<T> = {
  await(id: string, owner: string, timeoutMs: number): Promise<T>
  resolve(id: string, value: T): boolean
  abandon(owner: string, reason: Error): void
  idle(): boolean
}

type Waiter<T> = {owner: string; settle: (value: T) => void; fail: (reason: Error) => void}

function makePending<T>(timedOut: () => Error): Pending<T> {
  const waiters = new Map<string, Waiter<T>>()

  function awaitReply(id: string, owner: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((settle, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id)
        reject(timedOut())
      }, timeoutMs)
      const done = (): void => {
        clearTimeout(timer)
        waiters.delete(id)
      }
      waiters.set(id, {
        owner,
        settle: (value) => {
          done()
          settle(value)
        },
        fail: (reason) => {
          done()
          reject(reason)
        },
      })
    })
  }

  function resolve(id: string, value: T): boolean {
    const waiter = waiters.get(id)
    if (!waiter) return false
    waiter.settle(value)
    return true
  }

  function abandon(owner: string, reason: Error): void {
    const owned = [...waiters.values()].filter((waiter) => waiter.owner === owner)
    owned.forEach((waiter) => waiter.fail(reason))
  }

  return {await: awaitReply, resolve, abandon, idle: () => waiters.size === 0}
}

export type PageAnswer = {result: Record<string, unknown>; capture?: PageCaptureBundle}

export type BrowserTabFocus = {focusedAt: number; visible: boolean}

export type QueuePlay = {accepted: Promise<PageAnswer>; played: Promise<PageOutcome>[]}

export const QUEUED_ACTION_MS = 7000

export type PageBus = {
  ask: (
    sessionId: SessionId,
    query: Omit<PageQuery, 'requestId'>,
    route?: {browserTab: string} | {mutating: boolean},
  ) => Promise<PageAnswer>
  connected: (sessionId: SessionId) => boolean
  anySubscriber: () => boolean
  openSessions: () => Array<{sessionId: SessionId; browserTabs: string[]}>
  resolve: (sessionId: SessionId, requestId: string, outcome: PageOutcome) => boolean
  subscribe: (sessionId: SessionId, emit: (frame: unknown) => void, focus?: () => BrowserTabFocus) => () => void
  playQueue: (sessionId: SessionId, query: Omit<PageQuery, 'requestId'>, queueId: string, count: number) => QueuePlay
}

export type CaptureSink = (params: {
  sessionId: SessionId
  toolCallId: string
  bundle: PageCaptureBundle
}) => Promise<void>

export type PageEnv = {journal: Journal; root: string; bus: PageBus; storeCapture: CaptureSink; queues: PageQueues}

type BrowserTab = {id: string; order: number; emit: (frame: unknown) => void; focus: () => BrowserTabFocus}

type SessionPage = {pending: Pending<PageOutcome>; browserTabs: Map<string, BrowserTab>}

const UNREPORTED: BrowserTabFocus = {focusedAt: 0, visible: false}

const BROWSER_TAB_RETURN_MS = 5000

export function makePageBus(timeoutMs = 5000): PageBus {
  const bySession = new Map<SessionId, SessionPage>()
  const subscribed = {count: 0}
  const arrivals = new EventTarget()
  const lanes = new Map<SessionId, Set<{until: number}>>()

  const laneBudget = (sessionId: SessionId): number => {
    const until = Math.max(0, ...[...(lanes.get(sessionId) ?? [])].map((entry) => entry.until))
    return Math.max(0, until - Date.now())
  }

  const pageOf = (sessionId: SessionId): SessionPage => {
    const existing = bySession.get(sessionId)
    if (existing) return existing
    const created: SessionPage = {pending: makePending<PageOutcome>(unanswered), browserTabs: new Map()}
    bySession.set(sessionId, created)
    return created
  }

  const dropIfIdle = (sessionId: SessionId, page: SessionPage): void => {
    if (page.browserTabs.size > 0 || !page.pending.idle()) return
    if (bySession.get(sessionId) === page) bySession.delete(sessionId)
  }

  function subscribe(
    sessionId: SessionId,
    emit: (frame: unknown) => void,
    focus: () => BrowserTabFocus = () => UNREPORTED,
  ): () => void {
    const page = pageOf(sessionId)
    subscribed.count += 1
    const id = `b${subscribed.count}`
    page.browserTabs.set(id, {id, order: subscribed.count, emit, focus})
    arrivals.dispatchEvent(new Event(sessionId))
    return () => {
      page.browserTabs.delete(id)
      page.pending.abandon(id, pageFailure('no-widget', `browser tab ${id} closed before it replied`))
      dropIfIdle(sessionId, page)
    }
  }

  function openSessions(): Array<{sessionId: SessionId; browserTabs: string[]}> {
    return [...bySession].flatMap(([sessionId, page]) =>
      page.browserTabs.size > 0 ? [{sessionId, browserTabs: focusOrder(page).map((tab) => tab.id)}] : [],
    )
  }

  function anySubscriber(): boolean {
    return openSessions().length > 0
  }

  function target(sessionId: SessionId, page: SessionPage | undefined, browserTab: string | undefined): BrowserTab {
    if (page === undefined || page.browserTabs.size === 0) {
      if (anySubscriber()) {
        throw pageFailure(
          'no-widget',
          'the page is showing another session; switch back to this session to use page tools',
        )
      }
      throw pageFailure('no-widget', `no widget connected to session "${sessionId}"`)
    }
    const chosen = browserTab === undefined ? focusOrder(page)[0] : page.browserTabs.get(browserTab)
    if (chosen !== undefined) return chosen
    const open = [...page.browserTabs.keys()].join(', ')
    throw pageFailure('no-widget', `browser tab ${browserTab ?? ''} is not open; open browser tabs: ${open}`)
  }

  async function send(
    sessionId: SessionId,
    tab: BrowserTab,
    query: Omit<PageQuery, 'requestId'>,
    ms: number,
  ): Promise<PageOutcome> {
    const requestId = randomUUID()
    const settled = pageOf(sessionId)
    tab.emit({requestId, ...query})
    return settled.pending.await(requestId, tab.id, ms).finally(() => dropIfIdle(sessionId, settled))
  }

  function servingAgain(sessionId: SessionId, ms: number): Promise<unknown> {
    if (connected(sessionId)) return Promise.resolve()
    return once(arrivals, sessionId, {signal: AbortSignal.timeout(Math.max(ms, 0))})
  }

  async function ask(
    sessionId: SessionId,
    query: Omit<PageQuery, 'requestId'>,
    route?: {browserTab: string} | {mutating: boolean},
  ): Promise<PageAnswer> {
    const pinned = route !== undefined && 'browserTab' in route ? route.browserTab : undefined
    const tab = target(sessionId, bySession.get(sessionId), pinned)
    const declared = query.input['timeout']
    const ms =
      (typeof declared === 'number' ? declared + 1000 : timeoutMs) + (query.mutating ? laneBudget(sessionId) : 0)
    const deadline = Date.now() + ms
    const outcome = await send(sessionId, tab, query, ms).catch(async (error: unknown) => {
      if (route === undefined || 'browserTab' in route || !isPageFailure(error)) throw error
      if (error.error.code !== 'no-widget') throw error
      if (route.mutating) {
        throw pageFailure(
          'no-widget',
          `the page reloaded or closed during ${query.name}; it may already have run. Take a new snapshot before continuing`,
        )
      }
      await servingAgain(sessionId, Math.min(BROWSER_TAB_RETURN_MS, deadline - Date.now())).catch((waited: unknown) => {
        throw isAbort(waited) ? error : waited
      })
      return send(
        sessionId,
        target(sessionId, bySession.get(sessionId), undefined),
        query,
        Math.max(deadline - Date.now(), 0),
      )
    })
    if (!outcome.ok) throw pageFailure(outcome.error.code, outcome.error.message, outcome.error.raised)
    if (outcome.capture === undefined) return {result: outcome.result}
    return {result: outcome.result, capture: outcome.capture}
  }

  function playQueue(
    sessionId: SessionId,
    query: Omit<PageQuery, 'requestId'>,
    queueId: string,
    count: number,
  ): QueuePlay {
    const tab = target(sessionId, bySession.get(sessionId), undefined)
    const page = pageOf(sessionId)
    const ahead = laneBudget(sessionId)
    const entry = {until: Date.now() + ahead + count * QUEUED_ACTION_MS}
    const lane = lanes.get(sessionId) ?? new Set()
    lanes.set(sessionId, lane.add(entry))
    const requestId = randomUUID()
    const replies = Array.from({length: count}, () => randomUUID())
    const played = replies.map((id, index) => page.pending.await(id, tab.id, ahead + (index + 1) * QUEUED_ACTION_MS))
    const accepted = page.pending.await(requestId, tab.id, timeoutMs).then((outcome): PageAnswer => {
      if (!outcome.ok) throw pageFailure(outcome.error.code, outcome.error.message, outcome.error.raised)
      return {result: outcome.result}
    })
    accepted.catch((error: unknown) => {
      const refused: PageOutcome = {
        ok: false,
        error: {code: 'handler-error', message: `the page refused the queue: ${String(error)}`},
      }
      replies.forEach((id) => page.pending.resolve(id, refused))
    })
    void Promise.allSettled([accepted, ...played]).then(() => {
      lane.delete(entry)
      if (lane.size === 0 && lanes.get(sessionId) === lane) lanes.delete(sessionId)
      dropIfIdle(sessionId, page)
    })
    tab.emit({requestId, ...query, queue: {id: queueId, replies}})
    return {accepted, played}
  }

  function connected(sessionId: SessionId): boolean {
    return (bySession.get(sessionId)?.browserTabs.size ?? 0) > 0
  }

  return {
    ask,
    connected,
    anySubscriber,
    openSessions,
    resolve: (sessionId, requestId, outcome) => bySession.get(sessionId)?.pending.resolve(requestId, outcome) ?? false,
    subscribe,
    playQueue,
  }
}

function unanswered(): Error {
  return pageFailure('timeout', 'page did not reply (no widget connected?)')
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function focusOrder(page: SessionPage): BrowserTab[] {
  return orderBy(
    [...page.browserTabs.values()],
    [(tab) => tab.focus().focusedAt, (tab) => (tab.focus().visible ? 1 : 0), (tab) => tab.order],
    ['desc', 'desc', 'desc'],
  )
}

function frameRequestId(frame: unknown): string | null {
  if (typeof frame !== 'object' || frame === null) return null
  if (!('requestId' in frame) || typeof frame.requestId !== 'string') return null
  return frame.requestId
}

export async function* pageQueryStream(
  bus: PageBus,
  sessionId: SessionId,
  signal: AbortSignal,
  focus?: () => BrowserTabFocus,
): AsyncGenerator<{requestId: string; query: unknown}> {
  const queue: unknown[] = []
  const waiter = {wake: () => {}}
  const unsubscribe = bus.subscribe(
    sessionId,
    (frame) => {
      queue.push(frame)
      waiter.wake()
    },
    focus,
  )
  const onAbort = () => waiter.wake()
  signal.addEventListener('abort', onAbort, {once: true})
  try {
    while (!signal.aborted) {
      const frame = queue.shift()
      if (frame !== undefined) {
        const requestId = frameRequestId(frame)
        if (requestId !== null) yield {requestId, query: frame}
        continue
      }
      await new Promise<void>((resolve) => {
        waiter.wake = resolve
        if (queue.length > 0 || signal.aborted) resolve()
      })
      waiter.wake = () => {}
    }
  } finally {
    unsubscribe()
    signal.removeEventListener('abort', onAbort)
  }
}
