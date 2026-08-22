import {pageFailure, type PageOutcome, type PageQuery} from '@conciv/protocol/page-types'
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
  await(id: string, timeoutMs: number): Promise<T>
  resolve(id: string, value: T): boolean
  idle(): boolean
}

function makePending<T>(): Pending<T> {
  const waiters = new Map<string, (value: T) => void>()

  function awaitReply(id: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((settle, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id)
        reject(new Error('pending request timed out'))
      }, timeoutMs)
      waiters.set(id, (value) => {
        clearTimeout(timer)
        waiters.delete(id)
        settle(value)
      })
    })
  }

  function resolve(id: string, value: T): boolean {
    const waiter = waiters.get(id)
    if (!waiter) return false
    waiter(value)
    return true
  }

  return {await: awaitReply, resolve, idle: () => waiters.size === 0}
}

export type PageAnswer = {result: Record<string, unknown>; capture?: PageCaptureBundle}

export type PageBus = {
  ask: (sessionId: SessionId, query: Omit<PageQuery, 'requestId'>) => Promise<PageAnswer>
  connected: (sessionId: SessionId) => boolean
  anySubscriber: () => boolean
  resolve: (sessionId: SessionId, requestId: string, outcome: PageOutcome) => boolean
  subscribe: (sessionId: SessionId, emit: (frame: unknown) => void) => () => void
}

export type CaptureSink = (params: {
  sessionId: SessionId
  toolCallId: string
  bundle: PageCaptureBundle
}) => Promise<void>

export type PageEnv = {journal: Journal; root: string; bus: PageBus; storeCapture: CaptureSink}

type SessionPage = {pending: Pending<PageOutcome>; subscribers: Set<(frame: unknown) => void>}

export function makePageBus(timeoutMs = 5000): PageBus {
  const bySession = new Map<SessionId, SessionPage>()
  const idState = {n: 0}

  const pageOf = (sessionId: SessionId): SessionPage => {
    const existing = bySession.get(sessionId)
    if (existing) return existing
    const created: SessionPage = {pending: makePending<PageOutcome>(), subscribers: new Set()}
    bySession.set(sessionId, created)
    return created
  }

  const dropIfIdle = (sessionId: SessionId, page: SessionPage): void => {
    if (page.subscribers.size > 0 || !page.pending.idle()) return
    if (bySession.get(sessionId) === page) bySession.delete(sessionId)
  }

  function subscribe(sessionId: SessionId, emit: (frame: unknown) => void): () => void {
    const page = pageOf(sessionId)
    page.subscribers.add(emit)
    return () => {
      page.subscribers.delete(emit)
      dropIfIdle(sessionId, page)
    }
  }

  async function ask(sessionId: SessionId, query: Omit<PageQuery, 'requestId'>): Promise<PageAnswer> {
    const page = bySession.get(sessionId)
    if (page === undefined || page.subscribers.size === 0) {
      throw pageFailure('no-widget', `no widget connected to session "${sessionId}"`)
    }
    idState.n += 1
    const requestId = `pq${idState.n}`
    const declared = query.input['timeout']
    const ms = typeof declared === 'number' ? declared + 1000 : timeoutMs
    for (const emit of page.subscribers) emit({requestId, ...query})
    const outcome = await page.pending
      .await(requestId, ms)
      .catch(() => {
        throw pageFailure('timeout', 'page did not reply (no widget connected?)')
      })
      .finally(() => dropIfIdle(sessionId, page))
    if (!outcome.ok) throw pageFailure(outcome.error.code, outcome.error.message, outcome.error.raised)
    if (outcome.capture === undefined) return {result: outcome.result}
    return {result: outcome.result, capture: outcome.capture}
  }

  return {
    ask,
    connected: (sessionId) => (bySession.get(sessionId)?.subscribers.size ?? 0) > 0,
    anySubscriber: () => [...bySession.values()].some((page) => page.subscribers.size > 0),
    resolve: (sessionId, requestId, outcome) => bySession.get(sessionId)?.pending.resolve(requestId, outcome) ?? false,
    subscribe,
  }
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
): AsyncGenerator<{requestId: string; query: unknown}> {
  const queue: unknown[] = []
  const waiter = {wake: () => {}}
  const unsubscribe = bus.subscribe(sessionId, (frame) => {
    queue.push(frame)
    waiter.wake()
  })
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
