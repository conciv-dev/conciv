import {HTTPException} from 'hono/http-exception'
import {isMutating, type PageQuery, type PageQueryInput} from '@conciv/protocol/page-types'
import {symbolicateFrames, type RawFrame} from './editor/symbolicate.js'

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
  resolve: (requestId: string, data: Record<string, unknown>) => boolean
  subscribe: (emit: (frame: unknown) => void) => () => void
}

export type PageEnv = {journal: Journal; root: string; bus: PageBus}

export function makePageBus(timeoutMs = 5000): PageBus {
  const pending = makePending<Record<string, unknown>>()
  const subscribers = new Set<(frame: unknown) => void>()
  const idState = {n: 0}

  function subscribe(emit: (frame: unknown) => void): () => void {
    subscribers.add(emit)
    return () => subscribers.delete(emit)
  }

  async function ask(query: Omit<PageQuery, 'requestId'>): Promise<Record<string, unknown>> {
    if (subscribers.size === 0) throw new HTTPException(503, {message: 'no widget connected'})
    idState.n += 1
    const requestId = `pq${idState.n}`
    const ms = typeof query.timeout === 'number' ? query.timeout + 1000 : timeoutMs
    for (const emit of subscribers) emit({requestId, ...query})
    try {
      return await pending.await(requestId, ms)
    } catch {
      throw new HTTPException(504, {message: 'page did not reply (no widget connected?)'})
    }
  }

  return {ask, resolve: pending.resolve, subscribe}
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

function pageArgs(input: PageQueryInput): Record<string, unknown> {
  const {ref: _ref, selector: _selector, since: _since, ...rest} = input
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

export async function runVerb(
  env: PageEnv,
  input: PageQueryInput,
  verb: PageQuery['kind'],
): Promise<Record<string, unknown>> {
  const data = await env.bus.ask({kind: verb, ...input})
  if (isMutating(verb)) {
    env.journal.append({verb, ref: input.ref, selector: input.selector, args: pageArgs(input)}, Date.now())
  }
  if (verb === 'locate' && !data.source && Array.isArray(data.frames)) {
    return {...data, source: await symbolicateFrames(data.frames as RawFrame[], env.root)}
  }
  return data
}
