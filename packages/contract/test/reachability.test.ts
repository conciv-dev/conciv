import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ORPCError} from '@orpc/client'
import {
  browserRpcConnection,
  closeBrowserRpcConnection,
  isRetryableRpcFailure,
  reprobeBrowserRpcConnection,
  subscribeRpcReachability,
} from '../src/browser-transport.js'

const NATIVE_CONNECTING = 0
const NATIVE_OPEN = 1
const NATIVE_CLOSING = 2
const NATIVE_CLOSED = 3

class FakeNativeSocket extends EventTarget {
  static instances: FakeNativeSocket[] = []
  readonly CONNECTING = NATIVE_CONNECTING
  readonly OPEN = NATIVE_OPEN
  readonly CLOSING = NATIVE_CLOSING
  readonly CLOSED = NATIVE_CLOSED
  readyState = NATIVE_CONNECTING
  binaryType = 'blob'
  bufferedAmount = 0

  constructor() {
    super()
    FakeNativeSocket.instances.push(this)
  }

  send(): void {}

  close(): void {
    this.readyState = NATIVE_CLOSING
    queueMicrotask(() => {
      this.readyState = NATIVE_CLOSED
      this.dispatchEvent(new Event('close'))
    })
  }

  open(): void {
    this.readyState = NATIVE_OPEN
    this.dispatchEvent(new Event('open'))
  }

  fail(): void {
    this.readyState = NATIVE_CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

async function nextSocket(afterCount = 0): Promise<FakeNativeSocket> {
  while (FakeNativeSocket.instances.length <= afterCount) await new Promise((resolve) => setTimeout(resolve, 5))
  const instance = FakeNativeSocket.instances[FakeNativeSocket.instances.length - 1]
  if (!instance) throw new Error('expected a fake socket instance')
  return instance
}

async function connectAndTrackVotes(base: string): Promise<{votes: boolean[]; socket: FakeNativeSocket}> {
  const votes: boolean[] = []
  subscribeRpcReachability(base, (reachable) => votes.push(reachable))
  browserRpcConnection(base)
  const socket = await nextSocket()
  return {votes, socket}
}

let originalWebSocket: typeof globalThis.WebSocket | undefined

beforeEach(() => {
  FakeNativeSocket.instances = []
  originalWebSocket = globalThis.WebSocket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.WebSocket = FakeNativeSocket as any
})

afterEach(() => {
  globalThis.WebSocket = originalWebSocket as typeof globalThis.WebSocket
})

function apiBase(name: string): string {
  return `http://reachability-${name}.test`
}

describe('subscribeRpcReachability edge discrimination', () => {
  it('votes online when the probe socket opens', async () => {
    const base = apiBase('open')
    const {votes, socket} = await connectAndTrackVotes(base)
    socket.open()
    expect(votes).toEqual([true])
    closeBrowserRpcConnection(base)
  })

  it('emits no edge for a deliberate close we initiate', async () => {
    const base = apiBase('deliberate')
    const {votes, socket} = await connectAndTrackVotes(base)
    socket.open()
    votes.length = 0
    closeBrowserRpcConnection(base)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(votes).toEqual([])
  })

  it('votes offline on a close following a failed connect attempt', async () => {
    const base = apiBase('failed-connect')
    const {votes, socket} = await connectAndTrackVotes(base)
    socket.fail()
    expect(votes).toEqual([false])
    closeBrowserRpcConnection(base)
  })

  it('treats an established socket drop as a blip, not an immediate offline vote, then votes offline if the reconnect attempt also fails', async () => {
    const base = apiBase('blip')
    const {votes, socket} = await connectAndTrackVotes(base)
    socket.open()
    votes.length = 0
    socket.fail()
    expect(votes).toEqual([])
    const reconnectAttempt = await nextSocket(1)
    reconnectAttempt.fail()
    expect(votes).toEqual([false])
    closeBrowserRpcConnection(base)
  })

  it('drops stale votes from a connection reprobe has already replaced', async () => {
    const base = apiBase('stale')
    const {votes, socket: staleSocket} = await connectAndTrackVotes(base)
    staleSocket.open()
    votes.length = 0
    reprobeBrowserRpcConnection(base)
    const freshSocket = await nextSocket(1)
    expect(freshSocket).not.toBe(staleSocket)
    staleSocket.fail()
    expect(votes).toEqual([])
    freshSocket.open()
    expect(votes).toEqual([true])
    closeBrowserRpcConnection(base)
  })
})

describe('isRetryableRpcFailure', () => {
  it('never treats an ORPCError as retryable: the server answered, so it is reachable', () => {
    expect(isRetryableRpcFailure(true, new ORPCError('BAD_REQUEST'))).toBe(false)
  })

  it('treats a transport failure as retryable while the connection is alive', () => {
    expect(isRetryableRpcFailure(true, new TypeError('fetch failed'))).toBe(true)
  })

  it('never retries once the connection has been deliberately closed', () => {
    expect(isRetryableRpcFailure(false, new TypeError('fetch failed'))).toBe(false)
  })
})

describe('retry-settle reachability votes over the fetch transport', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('votes offline on a transport failure and online once the retry settles', async () => {
    vi.useFakeTimers()
    const base = apiBase('fetch-retry')
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new TypeError('network error')
      return new Response(JSON.stringify({json: []}), {headers: {'content-type': 'application/json'}})
    })
    const votes: boolean[] = []
    subscribeRpcReachability(base, (reachable) => votes.push(reachable))
    const connection = browserRpcConnection(base, 'fetch')
    const {createORPCClient} = await import('@orpc/client')
    const client = createORPCClient<{sessions: {list: (input: undefined) => Promise<unknown>}}>(connection.link)
    const pending = client.sessions.list(undefined)
    await vi.advanceTimersByTimeAsync(300)
    await pending
    expect(votes).toEqual([false, true])
    closeBrowserRpcConnection(base)
  })
})
