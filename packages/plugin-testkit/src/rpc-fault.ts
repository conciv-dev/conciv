import type {Page} from 'playwright'
import {rpcObserverFor, type RpcInputPattern} from './rpc-observer.js'
import {matchesPattern, samePath} from './rpc-payload.js'
import {rpcSocketFor, type RpcSocketCall} from './rpc-socket.js'

const ANSWER_TIMEOUT_MS = 15_000
const RELEASED_GATE_STATUS = 200

type CallMatcher = (call: RpcSocketCall) => boolean

export type RpcFaultInjector = {repair: () => void; dispose: () => Promise<void>; answered: () => Promise<void>}

function answeredBy(page: Page, path: readonly string[] | undefined, status: number): () => Promise<void> {
  const since = rpcObserverFor(page).mark()
  return () => {
    if (!path) {
      return Promise.reject(new Error('this fault matches every rpc path, so it has no single call to await'))
    }
    return rpcObserverFor(page)
      .completed({path, status, since, timeout: ANSWER_TIMEOUT_MS})
      .then(() => undefined)
  }
}

function pathMatcher(path: readonly string[] | undefined): CallMatcher {
  if (!path) return () => true
  return (call) => samePath(call.path, path)
}

function callMatcher(path: readonly string[], input: RpcInputPattern | undefined): CallMatcher {
  const onPath = pathMatcher(path)
  if (input === undefined) return onPath
  return (call) => onPath(call) && matchesPattern(call.input, input)
}

async function brokenWhile(
  page: Page,
  matches: CallMatcher,
  answered: () => Promise<void>,
  breakCall: (call: RpcSocketCall) => void,
): Promise<RpcFaultInjector> {
  const socket = rpcSocketFor(page)
  await socket.installed
  const broken = {value: true}
  const remove = socket.rule((call) => {
    if (!broken.value || !matches(call)) return 'pass'
    breakCall(call)
    return 'handled'
  })
  return {
    answered,
    repair: () => {
      broken.value = false
    },
    dispose: async () => {
      broken.value = false
      remove()
    },
  }
}

export function failRpcCalls(
  page: Page,
  options: {path: readonly string[]; status?: number},
): Promise<RpcFaultInjector> {
  const status = options.status ?? 500
  return brokenWhile(page, pathMatcher(options.path), answeredBy(page, options.path, status), (call) => {
    call
      .reply(status)
      .catch((error: unknown) => console.error('[extension-testkit] the rpc failure reply failed', error))
  })
}

export function abortRpcCalls(page: Page, options: {path?: readonly string[]} = {}): Promise<RpcFaultInjector> {
  const answered = (): Promise<void> =>
    Promise.reject(new Error('an aborted rpc call never reaches the server, so it is never answered'))
  return brokenWhile(page, pathMatcher(options.path), answered, (call) => call.cut())
}

export function garbleRpcReplies(
  page: Page,
  options: {path: readonly string[]; input?: RpcInputPattern},
): Promise<RpcFaultInjector> {
  const answered = (): Promise<void> =>
    Promise.reject(new Error('a garbled rpc call never reaches the server, so it is never answered'))
  return brokenWhile(page, callMatcher(options.path, options.input), answered, (call) => {
    call.garble().catch((error: unknown) => console.error('[extension-testkit] the garbled rpc reply failed', error))
  })
}

export type RpcHold = {hold: () => void; release: () => void}

export async function holdRpcCalls(page: Page): Promise<RpcHold> {
  const socket = rpcSocketFor(page)
  await socket.installed
  return {hold: socket.hold, release: socket.release}
}

export type RpcGate = {
  pending: () => number
  awaitCaptured: (count: number) => Promise<void>
  answered: () => Promise<void>
  release: () => Promise<void>
  dispose: () => Promise<void>
}

type CaptureWaiter = {count: number; deliver: () => void}

export async function gateRpcCalls(
  page: Page,
  options: {path?: readonly string[]; onRelease?: 'forward' | 'cut'} = {},
): Promise<RpcGate> {
  const socket = rpcSocketFor(page)
  await socket.installed
  const matches = pathMatcher(options.path)
  const answered = answeredBy(page, options.path, RELEASED_GATE_STATUS)
  const open = {value: false}
  const captured: RpcSocketCall[] = []
  const waiters = new Set<CaptureWaiter>()
  const remove = socket.rule((call) => {
    if (open.value || !matches(call)) return 'pass'
    captured.push(call)
    for (const waiter of waiters) {
      if (captured.length < waiter.count) continue
      waiters.delete(waiter)
      waiter.deliver()
    }
    return 'handled'
  })
  const settleCall =
    options.onRelease === 'cut' ? (call: RpcSocketCall) => call.cut() : (call: RpcSocketCall) => call.forward()
  const settle = (): void => {
    for (const call of captured.splice(0)) settleCall(call)
  }
  return {
    answered,
    pending: () => captured.length,
    awaitCaptured: (count) => {
      if (captured.length >= count) return Promise.resolve()
      return new Promise<void>((resolve) => {
        waiters.add({count, deliver: resolve})
      })
    },
    release: async () => {
      open.value = true
      settle()
    },
    dispose: async () => {
      open.value = true
      settle()
      remove()
    },
  }
}
