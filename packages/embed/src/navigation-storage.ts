import {debounce} from '@tanstack/pacer'
import type {RpcClient} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'
import {NavigationStateSchema, type NavigationState} from '@conciv/protocol/chat-types'

const WRITE_DELAY_MS = 300

function parseNavigation(raw: string): NavigationState | null {
  try {
    const parsed = NavigationStateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export type NavigationStorage = WebStorage & {restored: Promise<void>; dispose: () => void}

export function makeNavigationStorage(rpc: RpcClient, onRestore: (href: string) => void): NavigationStorage {
  const state = {cache: null as string | null, lastStamp: 0, wroteLocally: false, cancelled: false}
  const stamp = (): number => {
    state.lastStamp = Math.max(Date.now(), state.lastStamp + 1)
    return state.lastStamp
  }
  const write = debounce(
    (navigation: NavigationState, updatedAt: number) => {
      void rpc.navigation.set({...navigation, updatedAt}).catch(() => {})
    },
    {wait: WRITE_DELAY_MS},
  )
  const restored = rpc.navigation
    .get(undefined)
    .catch(() => null)
    .then((initial) => {
      if (state.cancelled || state.wroteLocally || !initial) return
      state.lastStamp = initial.updatedAt
      state.cache = JSON.stringify({entries: initial.entries, index: initial.index})
      const current = initial.entries[initial.index]
      if (current) onRestore(current.href)
    })
  return {
    getItem: () => state.cache,
    setItem: (_key, value) => {
      state.wroteLocally = true
      state.cache = value
      const parsed = parseNavigation(value)
      if (parsed) write(parsed, stamp())
    },
    restored,
    dispose: () => {
      state.cancelled = true
    },
  }
}
