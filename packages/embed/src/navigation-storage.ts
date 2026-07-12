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

function stripOpenParam(href: string): string {
  const [path = href, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  params.delete('open')
  const rest = params.toString()
  return rest ? `${path}?${rest}` : path
}

const bootShuttered = (state: NavigationState): NavigationState => ({
  ...state,
  entries: state.entries.map((entry) => ({...entry, href: stripOpenParam(entry.href)})),
})

export async function makeNavigationStorage(rpc: RpcClient): Promise<WebStorage> {
  const initial = await rpc.navigation.get(undefined).catch(() => null)
  let cache = initial ? JSON.stringify(bootShuttered(initial)) : null
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
