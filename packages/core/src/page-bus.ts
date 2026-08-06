import {pageFailure, type PageOutcome, type PageQuery} from '@conciv/protocol/page-types'

export type ChangeEntry = {
  seq: number
  ts: number
  verb: string
  ref?: string
  selector?: string
  args: Record<string, unknown>
}

export type Journal = {
  append: (e: Omit<ChangeEntry, 'seq' | 'ts'>, ts: number) => ChangeEntry
  list: () => ChangeEntry[]
  clear: () => void
}

export function makeJournal(): Journal {
  const entries: ChangeEntry[] = []
  const state = {seq: 0}

  function append(e: Omit<ChangeEntry, 'seq' | 'ts'>, ts: number): ChangeEntry {
    state.seq += 1
    const entry: ChangeEntry = {seq: state.seq, ts, verb: e.verb, ref: e.ref, selector: e.selector, args: e.args}
    entries.push(entry)
    return entry
  }
  function list(): ChangeEntry[] {
    return entries.map((e) => ({...e}))
  }
  function clear(): void {
    entries.length = 0
  }
  return {append, list, clear}
}

type Pending<T> = {
  await(id: string, timeoutMs: number): Promise<T>
  resolve(id: string, value: T): boolean
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

  return {await: awaitReply, resolve}
}

export type PageBus = {
  ask: (query: Omit<PageQuery, 'requestId'>) => Promise<Record<string, unknown>>
  connected: () => boolean
  resolve: (requestId: string, outcome: PageOutcome) => boolean
  subscribe: (emit: (frame: unknown) => void) => () => void
}

export type PageEnv = {journal: Journal; root: string; bus: PageBus}

export function makePageBus(timeoutMs = 5000): PageBus {
  const pending = makePending<PageOutcome>()
  const subscribers = new Set<(frame: unknown) => void>()
  const idState = {n: 0}

  function subscribe(emit: (frame: unknown) => void): () => void {
    subscribers.add(emit)
    return () => subscribers.delete(emit)
  }

  async function ask(query: Omit<PageQuery, 'requestId'>): Promise<Record<string, unknown>> {
    if (subscribers.size === 0) throw pageFailure('no-widget', 'no widget connected')
    idState.n += 1
    const requestId = `pq${idState.n}`
    const declared = query.input['timeout']
    const ms = typeof declared === 'number' ? declared + 1000 : timeoutMs
    for (const emit of subscribers) emit({requestId, ...query})
    const outcome = await pending.await(requestId, ms).catch(() => {
      throw pageFailure('timeout', 'page did not reply (no widget connected?)')
    })
    if (!outcome.ok) throw pageFailure(outcome.error.code, outcome.error.message, outcome.error.raised)
    return outcome.result
  }

  return {ask, connected: () => subscribers.size > 0, resolve: pending.resolve, subscribe}
}

function frameRequestId(frame: unknown): string | null {
  if (typeof frame !== 'object' || frame === null) return null
  if (!('requestId' in frame) || typeof frame.requestId !== 'string') return null
  return frame.requestId
}

export async function* pageQueryStream(
  bus: PageBus,
  signal: AbortSignal,
): AsyncGenerator<{requestId: string; query: unknown}> {
  const queue: unknown[] = []
  const waiter = {wake: () => {}}
  const unsubscribe = bus.subscribe((frame) => {
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

export function askPage(bus: PageBus, name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return bus.ask({name, input})
}
