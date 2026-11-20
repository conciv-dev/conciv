import {describe, expect, onTestFinished, test, vi} from 'vitest'
import {createMemoryHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {createConcivRouter, disposeConcivRouter} from './router'
import {parseConcivSettings} from './data/settings'

function routerWith(timings: Parameters<typeof createConcivRouter>[0]['timings']) {
  const router = createConcivRouter({
    rpc: makeRpcClient('http://127.0.0.1:9'),
    history: createMemoryHistory(),
    environment: {rootNode: document, document},
    settings: parseConcivSettings('{}'),
    timings,
  })
  onTestFinished(() => disposeConcivRouter(router))
  return router
}

describe('the router query retry delay', () => {
  test('retries a failed query after the short delay it was given, and keeps the library delay when none is given', async () => {
    expect(routerWith(undefined).options.context.queryClient.getDefaultOptions().queries).not.toHaveProperty(
      'retryDelay',
    )
    const queryClient = routerWith({queryRetryDelayMs: 7}).options.context.queryClient
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const tries = {count: 0}
    const fetched = queryClient
      .fetchQuery({
        queryKey: ['short-retry'],
        retry: 1,
        queryFn: () => {
          tries.count += 1
          return Promise.reject(new Error('down'))
        },
      })
      .catch(() => 'failed')
    await vi.advanceTimersByTimeAsync(7)
    expect(tries.count).toBe(2)
    expect(await fetched).toBe('failed')
  })
})
