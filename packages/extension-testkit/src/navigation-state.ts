import type {CoreKit} from './core-kit.js'

const stamp = {last: 0}

export function navigationStamp(): number {
  stamp.last = Math.max(Date.now(), stamp.last + 1)
  return stamp.last
}

export function seedNavigationStamp(observed: number): void {
  stamp.last = Math.max(stamp.last, observed)
}

export async function currentHref(kit: CoreKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  return persisted?.entries[persisted.index]?.href ?? ''
}
