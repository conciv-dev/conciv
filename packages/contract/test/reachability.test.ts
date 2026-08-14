import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ORPCError} from '@orpc/client'
import {
  browserRpcConnection,
  closeBrowserRpcConnection,
  isRetryableRpcFailure,
  reprobeBrowserRpcConnection,
  subscribeRpcReachability,
} from '../src/browser-transport.js'
import {
  fakeNativeSocketConstructor,
  nextSocket,
  resetFakeNativeSockets,
  type FakeNativeSocket,
} from './helpers/fake-native-socket.js'

async function connectAndTrackVotes(base: string): Promise<{votes: boolean[]; socket: FakeNativeSocket}> {
  const votes: boolean[] = []
  subscribeRpcReachability(base, (reachable) => votes.push(reachable))
  browserRpcConnection(base)
  const socket = await nextSocket()
  return {votes, socket}
}

beforeEach(() => {
  resetFakeNativeSockets()
  vi.stubGlobal('WebSocket', fakeNativeSocketConstructor)
})

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('never treats a self-initiated abort as retryable: the signal.reason a real AbortController produces', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isRetryableRpcFailure(true, controller.signal.reason)).toBe(false)
  })

  it('never treats the native AbortError DOMException fetch throws as retryable', () => {
    expect(isRetryableRpcFailure(true, new DOMException('The operation was aborted.', 'AbortError'))).toBe(false)
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

  it('a retry settle from an already-closed connection never votes: closing revokes its vote eligibility', async () => {
    vi.useFakeTimers()
    const base = apiBase('fetch-retry-closed')
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
    const pending = client.sessions.list(undefined).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(votes).toEqual([false])
    closeBrowserRpcConnection(base)
    votes.length = 0
    await vi.advanceTimersByTimeAsync(300)
    await pending
    expect(votes).toEqual([])
  })
})
