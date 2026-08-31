import type {Page, Request as PageRequest, Response as PageResponse, WebSocket as PageWebSocket} from 'playwright'
import {procedurePathOf, rpcPayload} from './rpc-payload.js'

const DEFAULT_TIMEOUT_MS = 30_000
const RPC_SOCKET_MARKER = '/rpc-ws'
const RPC_HTTP_MARKER = '/rpc/'

export type RpcCallRecord = {
  procedurePath: readonly string[]
  requestId: string
  input: unknown
  status: number | null
}

export type RpcInputPattern = unknown

export type RpcCallFilter = {
  path: readonly string[]
  input?: RpcInputPattern
  status?: number
  since?: number
  timeout?: number
}

export type RpcObserver = {
  mark: () => number
  completed: (filter: RpcCallFilter) => Promise<RpcCallRecord>
  startedCount: (filter: Omit<RpcCallFilter, 'timeout'>) => number
  completedCount: (filter: Omit<RpcCallFilter, 'timeout'>) => number
  socketCount: () => number
  dispose: () => void
}

type CallState = {
  record: RpcCallRecord
  startedAt: number
  completedAt: number | null
  completed: boolean
}

type Waiter = {
  filter: RpcCallFilter
  promise: Promise<unknown>
  deliver: (state: CallState) => void
  fail: (error: Error) => void
}

function createDeferred<Value>(): {
  promise: Promise<Value>
  resolve: (value: Value) => void
  reject: (error: Error) => void
} {
  let resolve: (value: Value) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<Value>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function matchesPattern(actual: unknown, expected: unknown): boolean {
  if (expected instanceof RegExp) return expected.test(typeof actual === 'string' ? actual : JSON.stringify(actual))
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item, index) => matchesPattern(actual[index], item))
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null) return false
    const carried: Record<string, unknown> = {...actual}
    return Object.entries(expected).every(([key, value]) => matchesPattern(carried[key], value))
  }
  return Object.is(actual, expected)
}

function samePath(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => segment === expected[index])
}

type Stamp = 'start' | 'completion'

function newerThan(state: CallState, since: number, stamp: Stamp): boolean {
  if (stamp === 'start') return state.startedAt > since
  return state.completedAt !== null && state.completedAt > since
}

function matches(state: CallState, filter: Omit<RpcCallFilter, 'timeout'>, stamp: Stamp): boolean {
  if (filter.since !== undefined && !newerThan(state, filter.since, stamp)) return false
  if (!samePath(state.record.procedurePath, filter.path)) return false
  if (filter.input !== undefined && !matchesPattern(state.record.input, filter.input)) return false
  return filter.status === undefined || state.record.status === filter.status
}

function requestInput(request: PageRequest): unknown {
  const raw = request.postData()
  if (raw === null) return undefined
  try {
    return rpcPayload(JSON.parse(raw))
  } catch {
    return raw
  }
}

export function observeRpc(page: Page): RpcObserver {
  const states: CallState[] = []
  const waiters = new Set<Waiter>()
  const httpCalls = new Map<PageRequest, CallState>()
  const sockets = {count: 0}
  const httpIds = {next: 0}
  const sequence = {next: 0}

  const notify = (state: CallState): void => {
    for (const waiter of waiters) {
      if (!matches(state, waiter.filter, 'completion') || !state.completed) continue
      waiters.delete(waiter)
      waiter.deliver(state)
    }
  }

  const httpProcedurePath = (url: string): readonly string[] | null => {
    const pathname = new URL(url).pathname
    const marker = pathname.indexOf(RPC_HTTP_MARKER)
    if (marker === -1) return null
    return procedurePathOf(pathname.slice(marker + RPC_HTTP_MARKER.length))
  }

  const httpState = (request: PageRequest): CallState | null => {
    const known = httpCalls.get(request)
    if (known) return known
    const procedurePath = httpProcedurePath(request.url())
    if (procedurePath === null) return null
    httpIds.next += 1
    const state: CallState = {
      record: {
        procedurePath,
        requestId: `http-${httpIds.next}`,
        input: requestInput(request),
        status: null,
      },
      startedAt: (sequence.next += 1),
      completedAt: null,
      completed: false,
    }
    httpCalls.set(request, state)
    states.push(state)
    return state
  }

  const onRequest = (request: PageRequest): void => {
    httpState(request)
  }

  const onResponse = (response: PageResponse): void => {
    const state = httpState(response.request())
    if (!state) return
    state.completedAt = sequence.next += 1
    state.record.status = response.status()
    state.completed = true
    notify(state)
  }

  const onSocket = (socket: PageWebSocket): void => {
    if (!socket.url().includes(RPC_SOCKET_MARKER)) return
    sockets.count += 1
  }

  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('websocket', onSocket)

  const buffered = (filter: RpcCallFilter): Promise<RpcCallRecord> => {
    const timeoutMs = filter.timeout ?? DEFAULT_TIMEOUT_MS
    const deferred = createDeferred<CallState>()
    const timer = setTimeout(() => {
      waiters.delete(waiter)
      const observed = states.map((state) => state.record.procedurePath.join('.')).join(', ')
      deferred.reject(
        new Error(
          `no rpc call to ${filter.path.join('.')} completed within ${timeoutMs}ms (observed calls: ${observed})`,
        ),
      )
    }, timeoutMs)
    const projected = deferred.promise.then((state) => state.record)
    const waiter: Waiter = {
      filter,
      promise: projected,
      deliver: (state) => {
        clearTimeout(timer)
        deferred.resolve(state)
      },
      fail: (error) => {
        clearTimeout(timer)
        deferred.reject(error)
      },
    }
    waiters.add(waiter)
    return projected
  }

  const settle = (filter: RpcCallFilter): Promise<RpcCallRecord> => {
    const seen = states.find((state) => matches(state, filter, 'completion') && state.completed)
    if (seen) return Promise.resolve(seen.record)
    return buffered(filter)
  }

  const counted = (filter: Omit<RpcCallFilter, 'timeout'>, stamp: Stamp): number =>
    states.filter((state) => matches(state, filter, stamp) && (stamp === 'start' || state.completed)).length

  return {
    mark: () => sequence.next,
    completed: (filter) => settle(filter),
    startedCount: (filter) => counted(filter, 'start'),
    completedCount: (filter) => counted(filter, 'completion'),
    socketCount: () => sockets.count,
    dispose: () => {
      page.off('request', onRequest)
      page.off('response', onResponse)
      page.off('websocket', onSocket)
      for (const waiter of waiters) {
        waiter.promise.catch(() => {})
        waiter.fail(new Error(`rpc observer disposed while awaiting ${waiter.filter.path.join('.')}`))
      }
      waiters.clear()
    },
  }
}

const observers = new WeakMap<Page, RpcObserver>()

export function rpcObserverFor(page: Page): RpcObserver {
  const existing = observers.get(page)
  if (existing) return existing
  const created = observeRpc(page)
  observers.set(page, created)
  return created
}
