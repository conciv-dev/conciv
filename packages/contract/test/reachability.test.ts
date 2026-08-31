import {afterEach, describe, expect, it, vi} from 'vitest'
import {ORPCError} from '@orpc/client'
import {
  browserRpcConnection,
  closeBrowserRpcConnection,
  isRetryableRpcFailure,
  subscribeRpcReachability,
} from '../src/browser-transport.js'

function apiBase(name: string): string {
  return `http://reachability-${name}.test`
}

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
    const connection = browserRpcConnection(base)
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
    const connection = browserRpcConnection(base)
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
