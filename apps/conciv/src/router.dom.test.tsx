import {describe, expect, test, vi} from 'vitest'
import {createMemoryHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {declareExpectedLog} from '@conciv/vitest-config/expected-log'
import {createConcivRouter, disposeConcivRouter} from './router'
import {parseConcivSettings} from './data/settings'

type Timings = Parameters<typeof createConcivRouter>[0]['timings']

type Clock = {freeze: () => void; advance: (milliseconds: number) => Promise<void>; runOut: () => Promise<void>}

// oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
const fakeClock = async ({}, use: (clock: Clock) => Promise<void>) => {
  try {
    await use({
      freeze: () => {
        vi.useFakeTimers()
      },
      advance: async (milliseconds) => {
        await vi.advanceTimersByTimeAsync(milliseconds)
      },
      runOut: async () => {
        await vi.runAllTimersAsync()
      },
    })
  } finally {
    vi.useRealTimers()
  }
}

type RouterFixtures = {clock: Clock; routerWith: (timings: Timings) => ReturnType<typeof createConcivRouter>}

const withRouters = test.extend<RouterFixtures>({
  clock: fakeClock,
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  routerWith: async ({}, use) => {
    const routers: ReturnType<typeof createConcivRouter>[] = []
    try {
      await use((timings) => {
        const router = createConcivRouter({
          rpc: makeRpcClient('http://127.0.0.1:9'),
          history: createMemoryHistory(),
          environment: {rootNode: document, document},
          settings: parseConcivSettings('{}'),
          timings,
        })
        routers.push(router)
        return router
      })
    } finally {
      routers.forEach(disposeConcivRouter)
    }
  },
})

describe('the router query retry delay', () => {
  withRouters(
    'retries a failed query after the short delay it was given, and keeps the library delay when none is given',
    async ({routerWith, clock, task}) => {
      declareExpectedLog(task, /drafts stay engine-only/)
      expect(routerWith(undefined).options.context.queryClient.getDefaultOptions().queries).not.toHaveProperty(
        'retryDelay',
      )
      const queryClient = routerWith({queryRetryDelayMs: 7}).options.context.queryClient
      clock.freeze()
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
      await clock.advance(7)
      expect(tries.count).toBe(2)
      expect(await fetched).toBe('failed')
    },
  )
})
