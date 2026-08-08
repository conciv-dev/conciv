import type {Page, Request as PageRequest, Response as PageResponse, WebSocket as PageWebSocket} from 'playwright'
import {decodeRpcFrame, procedurePathOf, rpcPayload} from './rpc-frames.js'

const DEFAULT_TIMEOUT_MS = 30_000
const RPC_SOCKET_MARKER = '/rpc-ws'
const RPC_HTTP_MARKER = '/rpc/'

export type RpcTransport = 'fetch' | 'websocket'

export type RpcCallRecord = {
  transport: RpcTransport
  procedurePath: readonly string[]
  requestId: string
  input: unknown
  status: number | null
  streaming: boolean
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
  firstEvent: (filter: RpcCallFilter) => Promise<{call: RpcCallRecord; data: unknown}>
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
  events: unknown[]
}

type Need = 'completed' | 'first-event'

type Waiter = {
  filter: RpcCallFilter
  needs: Need
  deliver: (state: CallState) => void
  fail: (error: Error) => void
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

function satisfied(state: CallState, needs: Need): boolean {
  return needs === 'completed' ? state.completed : state.events.length > 0
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

function fetchIteratorError(filter: RpcCallFilter): Error {
  return new Error(
    `${filter.path.join('.')} was answered over the fetch transport, whose iterator payloads playwright cannot see — await completed() (it resolves on the event-stream response) or drive the call over the websocket transport`,
  )
}

export function observeRpc(page: Page): RpcObserver {
  const states: CallState[] = []
  const waiters = new Set<Waiter>()
  const httpCalls = new Map<PageRequest, CallState>()
  const socketCalls = new Map<string, CallState>()
  const sockets = {count: 0}
  const httpIds = {next: 0}
  const sequence = {next: 0}
  const drift: {error: Error | null} = {error: null}

  const notify = (state: CallState): void => {
    for (const waiter of waiters) {
      if (
        waiter.needs === 'first-event' &&
        state.record.transport === 'fetch' &&
        matches(state, waiter.filter, 'completion')
      ) {
        waiters.delete(waiter)
        waiter.fail(fetchIteratorError(waiter.filter))
        continue
      }
      if (!matches(state, waiter.filter, 'completion') || !satisfied(state, waiter.needs)) continue
      waiters.delete(waiter)
      waiter.deliver(state)
    }
  }

  const failAll = (error: Error): void => {
    drift.error = error
    for (const waiter of waiters) {
      waiters.delete(waiter)
      waiter.fail(error)
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
        transport: 'fetch',
        procedurePath,
        requestId: `http-${httpIds.next}`,
        input: requestInput(request),
        status: null,
        streaming: false,
      },
      startedAt: (sequence.next += 1),
      completedAt: null,
      completed: false,
      events: [],
    }
    httpCalls.set(request, state)
    states.push(state)
    return state
  }

  const onRequest = (request: PageRequest): void => {
    const state = httpState(request)
    if (state) notify(state)
  }

  const onResponse = (response: PageResponse): void => {
    const state = httpState(response.request())
    if (!state) return
    state.completedAt = sequence.next += 1
    state.record.status = response.status()
    state.record.streaming = (response.headers()['content-type'] ?? '').startsWith('text/event-stream')
    state.completed = true
    notify(state)
  }

  const onSocket = (socket: PageWebSocket): void => {
    if (!socket.url().includes(RPC_SOCKET_MARKER)) return
    sockets.count += 1
    const socketId = `ws-${sockets.count}`
    const ordered = {tail: Promise.resolve()}
    const enqueue = (work: () => Promise<void>): void => {
      ordered.tail = ordered.tail.then(work).catch((error: unknown) => {
        failAll(error instanceof Error ? error : new Error(String(error)))
      })
    }
    socket.on('framesent', (frame) => {
      enqueue(async () => {
        const decoded = await decodeRpcFrame(frame.payload, 'outbound')
        if (decoded.phase !== 'request') return
        const key = `${socketId}:${decoded.requestId}`
        const state: CallState = {
          record: {
            transport: 'websocket',
            procedurePath: decoded.procedurePath,
            requestId: key,
            input: decoded.input,
            status: null,
            streaming: false,
          },
          startedAt: (sequence.next += 1),
          completedAt: null,
          completed: false,
          events: [],
        }
        socketCalls.set(key, state)
        states.push(state)
        notify(state)
      })
    })
    socket.on('framereceived', (frame) => {
      enqueue(async () => {
        const decoded = await decodeRpcFrame(frame.payload, 'inbound')
        const state = socketCalls.get(`${socketId}:${decoded.requestId}`)
        if (!state) return
        if (decoded.phase === 'response') {
          state.completedAt = sequence.next += 1
          state.record.status = decoded.status
          state.record.streaming = decoded.streaming
          state.completed = true
          notify(state)
          return
        }
        if (decoded.phase !== 'iterator-event') return
        state.events.push(decoded.data)
        notify(state)
      })
    })
  }

  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('websocket', onSocket)

  const buffered = (filter: RpcCallFilter, needs: Need): Promise<CallState> => {
    const timeoutMs = filter.timeout ?? DEFAULT_TIMEOUT_MS
    return new Promise<CallState>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(waiter)
        const observed = states.map((state) => state.record.procedurePath.join('.')).join(', ')
        reject(
          new Error(
            `no rpc call to ${filter.path.join('.')} reached "${needs}" within ${timeoutMs}ms (observed calls: ${observed})`,
          ),
        )
      }, timeoutMs)
      const waiter: Waiter = {
        filter,
        needs,
        deliver: (state) => {
          clearTimeout(timer)
          resolve(state)
        },
        fail: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      }
      waiters.add(waiter)
    })
  }

  const settle = (filter: RpcCallFilter, needs: Need): Promise<CallState> => {
    if (drift.error) return Promise.reject(drift.error)
    const seen = states.find((state) => matches(state, filter, 'completion') && satisfied(state, needs))
    if (seen) return Promise.resolve(seen)
    const answeredOverFetch = states.find(
      (state) => matches(state, filter, 'completion') && state.record.transport === 'fetch',
    )
    if (needs === 'first-event' && answeredOverFetch) return Promise.reject(fetchIteratorError(filter))
    return buffered(filter, needs)
  }

  const counted = (filter: Omit<RpcCallFilter, 'timeout'>, stamp: Stamp): number => {
    if (drift.error) throw drift.error
    return states.filter((state) => matches(state, filter, stamp) && (stamp === 'start' || state.completed)).length
  }

  return {
    mark: () => sequence.next,
    completed: async (filter) => (await settle(filter, 'completed')).record,
    firstEvent: async (filter) => {
      const state = await settle(filter, 'first-event')
      return {call: state.record, data: state.events[0]}
    },
    startedCount: (filter) => counted(filter, 'start'),
    completedCount: (filter) => counted(filter, 'completion'),
    socketCount: () => sockets.count,
    dispose: () => {
      page.off('request', onRequest)
      page.off('response', onResponse)
      page.off('websocket', onSocket)
      waiters.clear()
    },
  }
}
