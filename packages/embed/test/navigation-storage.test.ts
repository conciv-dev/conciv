import {describe, expect, it, vi} from 'vitest'
import type {NavigationWrite} from '@conciv/protocol/chat-types'
import {makeNavigationStorage} from '../src/navigation-storage.js'

type FakeNavigationRpc = {
  navigation: {
    get: () => Promise<null>
    set: (write: NavigationWrite) => Promise<{ok: true; applied: boolean}>
  }
}

function fakeRpc(
  onSet: (base: string, write: NavigationWrite) => void,
  currentBase: {value: string},
): FakeNavigationRpc {
  return {
    navigation: {
      get: async () => null,
      set: async (write) => {
        onSet(currentBase.value, write)
        return {ok: true, applied: true}
      },
    },
  }
}

describe('makeNavigationStorage', () => {
  it('never delivers a navigation write scheduled before dispose to the base that was active at delivery time', async () => {
    vi.useFakeTimers()
    try {
      const currentBase = {value: 'https://old.example.test'}
      const deliveries: Array<{base: string; write: NavigationWrite}> = []
      const rpc = fakeRpc((base, write) => deliveries.push({base, write}), currentBase)
      const storage = makeNavigationStorage(rpc, () => {})

      storage.setItem('conciv-navigation', JSON.stringify({entries: [{href: '/old'}], index: 0}))

      currentBase.value = 'https://new.example.test'
      storage.dispose()

      await vi.advanceTimersByTimeAsync(1000)

      expect(deliveries).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('delivers a navigation write to the currently bound base when not disposed before the debounce fires', async () => {
    vi.useFakeTimers()
    try {
      const currentBase = {value: 'https://old.example.test'}
      const deliveries: Array<{base: string; write: NavigationWrite}> = []
      const rpc = fakeRpc((base, write) => deliveries.push({base, write}), currentBase)
      const storage = makeNavigationStorage(rpc, () => {})

      storage.setItem('conciv-navigation', JSON.stringify({entries: [{href: '/old'}], index: 0}))
      await vi.advanceTimersByTimeAsync(1000)

      expect(deliveries).toHaveLength(1)
      expect(deliveries[0]?.base).toBe('https://old.example.test')
      storage.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
