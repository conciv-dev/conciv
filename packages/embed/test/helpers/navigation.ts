import type {NavigationEntry} from '@conciv/protocol/chat-types'
import type {EmbedKit} from './boot.js'

let lastStamp = 0

export function navigationStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

export async function setNavigation(kit: EmbedKit, entries: NavigationEntry[], index = 0): Promise<boolean> {
  const result = await kit.rpc.navigation.set({entries, index, updatedAt: navigationStamp()})
  return result.applied
}

export async function currentHref(kit: EmbedKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  return persisted?.entries[persisted.index]?.href ?? ''
}
