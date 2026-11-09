import type {RpcClient} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'
import {NavigationStateSchema, type NavigationState} from '@conciv/protocol/chat-types'

type NavigationRpc = Pick<RpcClient, 'navigation'>

function parseNavigation(raw: string): NavigationState | null {
  try {
    const parsed = NavigationStateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export type NavigationStorage = WebStorage & {restored: Promise<void>; dispose: () => void}

type NavigationStorageState = {cache: string | null; lastStamp: number; wroteLocally: boolean; cancelled: boolean}

export function makeNavigationStorage(
  rpc: NavigationRpc,
  trust: {ready: Promise<boolean>; isTrusted: () => boolean},
  onRestore: (href: string) => void,
): NavigationStorage {
  const state: NavigationStorageState = {cache: null, lastStamp: 0, wroteLocally: false, cancelled: false}
  const stamp = (): number => {
    state.lastStamp = Math.max(Date.now(), state.lastStamp + 1)
    return state.lastStamp
  }
  const write = (navigation: NavigationState, updatedAt: number): void => {
    if (!trust.isTrusted()) return
    void rpc.navigation.set({...navigation, updatedAt}).catch(() => {})
  }
  const restored = trust.ready
    .then((isTrusted) => (isTrusted ? rpc.navigation.get(undefined) : null))
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
