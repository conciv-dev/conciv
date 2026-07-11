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
  let cache = initial ? JSON.stringify(initial) : null
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    getItem: () => cache,
    setItem: (_key, value) => {
      cache = value
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const parsed = parseNavigation(value)
        if (parsed) void rpc.navigation.set(parsed).catch(() => {})
      }, WRITE_DELAY_MS)
    },
  }
}
