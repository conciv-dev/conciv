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

export async function makeNavigationStorage(rpc: RpcClient): Promise<WebStorage> {
  const initial = await rpc.navigation.get(undefined).catch(() => null)
  let cache = initial ? JSON.stringify({entries: initial.entries, index: initial.index}) : null
  let lastStamp = initial?.updatedAt ?? 0
  const stamp = (): number => {
    lastStamp = Math.max(Date.now(), lastStamp + 1)
    return lastStamp
  }
  const write = debounce(
    (state: NavigationState, updatedAt: number) => {
      void rpc.navigation.set({...state, updatedAt}).catch(() => {})
    },
    {wait: WRITE_DELAY_MS},
  )
  return {
    getItem: () => cache,
    setItem: (_key, value) => {
      cache = value
      const parsed = parseNavigation(value)
      if (parsed) write(parsed, stamp())
    },
  }
}
