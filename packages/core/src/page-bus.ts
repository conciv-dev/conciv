import {randomUUID} from 'node:crypto'
import {orderBy} from 'es-toolkit'
import {isPageFailure, pageFailure, type PageOutcome, type PageQuery} from '@conciv/protocol/page-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import {appendPageChange, clearPageChanges, pageChangesFor, type ConcivDb} from '@conciv/db'

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

function makePending<T>(): Pending<T> {
  const waiters = new Map<string, Waiter<T>>()

  function awaitReply(id: string, owner: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((settle, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id)
        reject(new Error('pending request timed out'))
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

export type PageBus = {
  ask: (sessionId: SessionId, query: Omit<PageQuery, 'requestId'>, browserTab?: string) => Promise<PageAnswer>
  connected: (sessionId: SessionId) => boolean
  anySubscriber: () => boolean
  openSessions: () => Array<{sessionId: SessionId; browserTabs: string[]}>
  resolve: (sessionId: SessionId, requestId: string, outcome: PageOutcome) => boolean
  subscribe: (sessionId: SessionId, emit: (frame: unknown) => void, focus?: () => BrowserTabFocus) => () => void
}

export type CaptureSink = (params: {
  sessionId: SessionId
  toolCallId: string
  bundle: PageCaptureBundle
}) => Promise<void>

export type PageEnv = {journal: Journal; root: string; bus: PageBus; storeCapture: CaptureSink}

type BrowserTab = {id: string; order: number; emit: (frame: unknown) => void; focus: () => BrowserTabFocus}

type SessionPage = {pending: Pending<PageOutcome>; browserTabs: Map<string, BrowserTab>}

const UNREPORTED: BrowserTabFocus = {focusedAt: 0, visible: false}

export function makePageBus(timeoutMs = 5000): PageBus {
  const bySession = new Map<SessionId, SessionPage>()
  const subscribed = {count: 0}

  const pageOf = (sessionId: SessionId): SessionPage => {
    const existing = bySession.get(sessionId)
    if (existing) return existing
    const created: SessionPage = {pending: makePending<PageOutcome>(), browserTabs: new Map()}
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

  async function ask(
    sessionId: SessionId,
    query: Omit<PageQuery, 'requestId'>,
    browserTab?: string,
  ): Promise<PageAnswer> {
    const page = bySession.get(sessionId)
    const tab = target(sessionId, page, browserTab)
    const requestId = randomUUID()
    const declared = query.input['timeout']
    const ms = typeof declared === 'number' ? declared + 1000 : timeoutMs
    const settled = pageOf(sessionId)
    tab.emit({requestId, ...query})
    const outcome = await settled.pending
      .await(requestId, tab.id, ms)
      .catch((error: unknown) => {
        throw isPageFailure(error) ? error : pageFailure('timeout', 'page did not reply (no widget connected?)')
      })
      .finally(() => dropIfIdle(sessionId, settled))
    if (!outcome.ok) throw pageFailure(outcome.error.code, outcome.error.message, outcome.error.raised)
    if (outcome.capture === undefined) return {result: outcome.result}
    return {result: outcome.result, capture: outcome.capture}
  }

  return {
    ask,
    connected: (sessionId) => (bySession.get(sessionId)?.browserTabs.size ?? 0) > 0,
    anySubscriber,
    openSessions,
    resolve: (sessionId, requestId, outcome) => bySession.get(sessionId)?.pending.resolve(requestId, outcome) ?? false,
    subscribe,
  }
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
