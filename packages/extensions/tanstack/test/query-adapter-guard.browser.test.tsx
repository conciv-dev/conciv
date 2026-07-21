import {describe, expect, it} from 'vitest'
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query'
import type {CacheEntry} from '@conciv/protocol/framework-types'
import {installReactBridge} from '@conciv/page'
import {invalidateQuery, readQueryCache, refetchQuery} from '../src/client/query-adapter.js'

const DEMO_KEY = JSON.stringify(['guard', 'demo'])

function Demo(): ReturnType<typeof createElement> {
  useQuery({queryKey: ['guard', 'demo'], queryFn: async () => ({fetched: true})})
  return createElement('div', null, 'guard demo')
}

function demoEntry(): CacheEntry | undefined {
  return readQueryCache().find((entry) => entry.key === DEMO_KEY)
}

describe('query-adapter invalidate/refetch guard (real QueryClient)', () => {
  it('guards unknown keys as no-ops while still invalidating the matching key', async () => {
    installReactBridge()
    const client = new QueryClient()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(createElement(QueryClientProvider, {client}, createElement(Demo)))

    try {
      await expect.poll(() => demoEntry()?.status, {timeout: 10_000}).toBe('success')
      const before = demoEntry()
      expect(before?.updatedAt).toEqual(expect.any(Number))

      await invalidateQuery('this-key-matches-nothing')
      await refetchQuery('this-key-matches-nothing')
      const afterUnknown = demoEntry()
      expect(afterUnknown?.updatedAt).toBe(before?.updatedAt)

      await invalidateQuery(DEMO_KEY)
      await expect
        .poll(
          () => {
            const entry = demoEntry()
            return entry && before && typeof entry.updatedAt === 'number' && typeof before.updatedAt === 'number'
              ? entry.updatedAt > before.updatedAt
              : false
          },
          {timeout: 10_000},
        )
        .toBe(true)
    } finally {
      root.unmount()
      host.remove()
    }
  })
})
