import {
  PAGE_PING_TOOL,
  pageFailure,
  PagePingResultSchema,
  type PageOutcome,
  type PageQuery,
} from '@conciv/protocol/page-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PageCaptureBundle} from '@conciv/protocol/element-capture-types'
import type {ServerVerb} from '@conciv/extension'
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

type PageAsk = Omit<PageQuery, 'requestId'> & {timeout?: number}

export type PageBus = {
  ask: (sessionId: SessionId, query: PageAsk) => Promise<PageAnswer>
  connected: (sessionId: SessionId) => boolean
  anySubscriber: () => boolean
  resolve: (sessionId: SessionId, requestId: string, outcome: PageOutcome) => boolean
  subscribe: (sessionId: SessionId, emit: (frame: unknown) => void) => () => void
  serve: (name: string, verb: ServerVerb) => void
}

export type CaptureSink = (params: {
  sessionId: SessionId
  toolCallId: string
  bundle: PageCaptureBundle
}) => Promise<void>

export type PageEnv = {journal: Journal; root: string; bus: PageBus; storeCapture: CaptureSink}

type Subscriber = {emit: (frame: unknown) => void; silent: number; unsubscribe: () => void}

type SessionPage = {pending: Pending<PageOutcome>; subscribers: Set<Subscriber>}

type PingAnswer = 'live' | 'hidden' | 'silent'

const PING_ABOVE_MS = 5000
const PING_BUDGET_MS = 1000
const SILENT_LIMIT = 3

export function makePageBus(timeoutMs = 5000): PageBus {
  const bySession = new Map<SessionId, SessionPage>()
  const idState = {n: 0}
  const served = new Map<string, ServerVerb>()

  const nextRequestId = (): string => {
    idState.n += 1
    return `pq${idState.n}`
  }

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

  const live = (page: SessionPage | undefined): boolean =>
    [...(page?.subscribers ?? [])].some((subscriber) => subscriber.silent < SILENT_LIMIT)

  function subscribe(sessionId: SessionId, emit: (frame: unknown) => void): () => void {
    const page = pageOf(sessionId)
    const subscriber: Subscriber = {
      emit,
      silent: 0,
      unsubscribe: () => {
        page.subscribers.delete(subscriber)
        dropIfIdle(sessionId, page)
      },
    }
    page.subscribers.add(subscriber)
    return subscriber.unsubscribe
  }

  async function ping(page: SessionPage, subscriber: Subscriber): Promise<PingAnswer> {
    const requestId = nextRequestId()
    subscriber.emit({requestId, name: PAGE_PING_TOOL, input: {}})
    const outcome = await page.pending.await(requestId, PING_BUDGET_MS).catch(() => null)
    if (outcome === null) {
      subscriber.silent += 1
      if (subscriber.silent >= SILENT_LIMIT) subscriber.unsubscribe()
      return 'silent'
    }
    subscriber.silent = 0
    if (!outcome.ok) return outcome.error.code === 'page-hidden' ? 'hidden' : 'live'
    const state = PagePingResultSchema.safeParse(outcome.result)
    return state.success && state.data.visibility === 'hidden' ? 'hidden' : 'live'
  }

  async function liveSubscribers(sessionId: SessionId, page: SessionPage): Promise<Subscriber[]> {
    const subscribers = [...page.subscribers]
    const answers = await Promise.all(subscribers.map((subscriber) => ping(page, subscriber)))
    const answering = subscribers.filter((_subscriber, index) => answers[index] === 'live')
    if (answering.length > 0) return answering
    const hidden = answers.filter((answer) => answer === 'hidden').length
    const silent = answers.filter((answer) => answer === 'silent').length
    dropIfIdle(sessionId, page)
    throw pageFailure(
      'no-live-widget',
      `no widget answered on session "${sessionId}": ${hidden} hidden, ${silent} silent`,
    )
  }

  function anySubscriber(): boolean {
    return [...bySession.values()].some(live)
  }

  async function ask(sessionId: SessionId, request: PageAsk): Promise<PageAnswer> {
    const {timeout, ...query} = request
    const verb = served.get(query.name)
    if (verb !== undefined) return {result: await verb(query.input, {sessionId})}
    const page = bySession.get(sessionId)
    if (page === undefined || page.subscribers.size === 0) {
      if (anySubscriber()) {
        throw pageFailure(
          'no-widget',
          'the page is showing another session; switch back to this session to use page tools',
        )
      }
      throw pageFailure('no-widget', `no widget connected to session "${sessionId}"`)
    }
    const declared = timeout ?? query.input['timeout']
    const ms = typeof declared === 'number' ? declared + 1000 : timeoutMs
    const targets = ms > PING_ABOVE_MS ? await liveSubscribers(sessionId, page) : [...page.subscribers]
    const requestId = nextRequestId()
    for (const subscriber of targets) subscriber.emit({requestId, ...query})
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
    connected: (sessionId) => live(bySession.get(sessionId)),
    anySubscriber,
    resolve: (sessionId, requestId, outcome) => bySession.get(sessionId)?.pending.resolve(requestId, outcome) ?? false,
    subscribe,
    serve: (name, verb) => {
      served.set(name, verb)
    },
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
