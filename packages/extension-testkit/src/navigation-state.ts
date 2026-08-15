import type {CoreKit} from './core-kit.js'

export async function currentHref(kit: CoreKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  return persisted?.entries[persisted.index]?.href ?? ''
}
