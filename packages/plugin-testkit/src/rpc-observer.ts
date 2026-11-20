import {matchesPattern, samePath} from './rpc-payload.js'
import {rpcSocketFor, type RpcSocketEvent, type RpcSocketSource} from './rpc-socket.js'

const DEFAULT_TIMEOUT_MS = 30_000

export type RpcCallRecord = {
  procedurePath: readonly string[]
  requestId: string
  input: unknown
  status: number | null
  output: unknown
  abandoned: boolean
}

export type RpcInputPattern = unknown

export type RpcCallFilter = {
  path: readonly string[]
  input?: RpcInputPattern
  status?: number
  served?: boolean
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
  served: boolean
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

type Stamp = 'start' | 'completion'

function newerThan(state: CallState, since: number, stamp: Stamp): boolean {
  if (stamp === 'start') return state.startedAt > since
  return state.completedAt !== null && state.completedAt > since
}

function matches(state: CallState, filter: Omit<RpcCallFilter, 'timeout'>, stamp: Stamp): boolean {
  if (filter.since !== undefined && !newerThan(state, filter.since, stamp)) return false
  if (!samePath(state.record.procedurePath, filter.path)) return false
  if (filter.input !== undefined && !matchesPattern(state.record.input, filter.input)) return false
  if (filter.served !== undefined && state.served !== filter.served) return false
  return filter.status === undefined || state.record.status === filter.status
}

export function observeRpc(source: RpcSocketSource): RpcObserver {
  const waiters = new Set<Waiter>()
  const calls = new Map<string, CallState>()
  const states = (): CallState[] => [...calls.values()]
  const sequence = {next: 0}
  const socket = rpcSocketFor(source)

  const notify = (state: CallState): void => {
    for (const waiter of waiters) {
      if (!matches(state, waiter.filter, 'completion') || !state.completed) continue
      waiters.delete(waiter)
      waiter.deliver(state)
    }
  }

  const onEvent = (event: RpcSocketEvent): void => {
    if (event.kind === 'request') {
      const state: CallState = {
        record: {
          procedurePath: event.path,
          requestId: event.requestId,
          input: event.input,
          status: null,
          output: undefined,
          abandoned: false,
        },
        startedAt: (sequence.next += 1),
        completedAt: null,
        completed: false,
        served: false,
      }
      calls.set(event.requestId, state)
      return
    }
    if (event.kind === 'abort') {
      const abandoned = calls.get(event.requestId)
      if (abandoned) abandoned.record.abandoned = true
      return
    }
    const state = calls.get(event.requestId)
    if (!state || state.completed) return
    state.completedAt = sequence.next += 1
    state.record.status = event.status
    state.record.output = event.output
    state.completed = true
    state.served = event.served
    notify(state)
  }

  const stopListening = socket.listen(onEvent)

  const buffered = (filter: RpcCallFilter): Promise<RpcCallRecord> => {
    const timeoutMs = filter.timeout ?? DEFAULT_TIMEOUT_MS
    const deferred = createDeferred<CallState>()
    const timer = setTimeout(() => {
      waiters.delete(waiter)
      const observed = states()
        .map((state) => state.record.procedurePath.join('.'))
        .join(', ')
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
    const seen = states().find((state) => matches(state, filter, 'completion') && state.completed)
    if (seen) return Promise.resolve(seen.record)
    return buffered(filter)
  }

  const counted = (filter: Omit<RpcCallFilter, 'timeout'>, stamp: Stamp): number =>
    states().filter((state) => matches(state, filter, stamp) && (stamp === 'start' || state.completed)).length

  return {
    mark: () => sequence.next,
    completed: (filter) => settle(filter),
    startedCount: (filter) => counted(filter, 'start'),
    completedCount: (filter) => counted(filter, 'completion'),
    socketCount: socket.opened,
    dispose: () => {
      stopListening()
      for (const waiter of waiters) {
        waiter.promise.catch(() => {})
        waiter.fail(new Error(`rpc observer disposed while awaiting ${waiter.filter.path.join('.')}`))
      }
      waiters.clear()
    },
  }
}

const observers = new WeakMap<RpcSocketSource, RpcObserver>()

export function rpcObserverFor(source: RpcSocketSource): RpcObserver {
  const existing = observers.get(source)
  if (existing) return existing
  const created = observeRpc(source)
  observers.set(source, created)
  return created
}
