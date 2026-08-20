import {describe, expect, it, vi} from 'vitest'
import {pump, type PagePlaneRpc} from '../src/index.js'
import type {PageDriver} from '../src/page-driver.js'

function fakeDriver(): PageDriver {
  return {execute: async () => ({ok: true, result: {}}), refs: {map: new Map(), n: 0}, dispose: () => {}}
}

function fakeRpc(onQueries: () => Promise<never>): PagePlaneRpc {
  return {
    page: {
      queries: onQueries,
      reply: async () => {
        throw new Error('reply not exercised in this test')
      },
    },
  }
}

describe('pump', () => {
  it('keeps probing rpc.page.queries at the slow cadence while offline instead of suppressing it', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const rpc = fakeRpc(async () => {
        calls += 1
        throw new Error('offline')
      })
      const abort = new AbortController()
      void pump(rpc, fakeDriver(), '', abort.signal, () => false)
      await vi.advanceTimersByTimeAsync(0)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(1999)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(calls).toBe(2)
      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })

  it('wakes immediately from the offline cadence sleep on an online edge instead of waiting out the full 2000ms', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const rpc = fakeRpc(async () => {
        calls += 1
        throw new Error('offline')
      })
      const abort = new AbortController()
      let wake: (() => void) | undefined
      let unsubscribed = false
      const subscribeOnline = (listener: () => void): (() => void) => {
        wake = listener
        return () => {
          unsubscribed = true
        }
      }
      void pump(rpc, fakeDriver(), '', abort.signal, () => false, subscribeOnline)
      await vi.advanceTimersByTimeAsync(0)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(calls).toBe(1)
      wake?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(calls).toBe(2)
      abort.abort()
      await vi.advanceTimersByTimeAsync(0)
      expect(unsubscribed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a raw socket reconnect aborts a stuck subscription instead of leaving it hung forever', async () => {
    let calls = 0
    let onReconnect: (() => void) | undefined
    const subscribeReconnect = (listener: () => void): (() => void) => {
      onReconnect = listener
      return () => {}
    }
    const rpc: PagePlaneRpc = {
      page: {
        queries: (_input, options) => {
          calls += 1
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('subscription aborted')))
          })
        },
        reply: async () => {
          throw new Error('reply not exercised in this test')
        },
      },
    }
    const abort = new AbortController()
    void pump(rpc, fakeDriver(), '', abort.signal, () => true, undefined, subscribeReconnect)
    await vi.waitFor(() => expect(calls).toBe(1))
    onReconnect?.()
    await vi.waitFor(() => expect(calls).toBe(2))
    abort.abort()
  })

  it('a reconnect that never fires leaves an otherwise-healthy subscription alone', async () => {
    let calls = 0
    const rpc: PagePlaneRpc = {
      page: {
        queries: (_input, options) => {
          calls += 1
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('subscription aborted')))
          })
        },
        reply: async () => {
          throw new Error('reply not exercised in this test')
        },
      },
    }
    const abort = new AbortController()
    void pump(rpc, fakeDriver(), '', abort.signal, () => true)
    await vi.waitFor(() => expect(calls).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toBe(1)
    abort.abort()
  })

  it('polls at the fast cadence while online', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const rpc = fakeRpc(async () => {
        calls += 1
        throw new Error('transient')
      })
      const abort = new AbortController()
      void pump(rpc, fakeDriver(), '', abort.signal, () => true)
      await vi.advanceTimersByTimeAsync(0)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(500)
      expect(calls).toBe(2)
      abort.abort()
    } finally {
      vi.useRealTimers()
    }
  })
})
