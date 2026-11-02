import type {CoreKit} from './core-kit.js'

export async function currentHref(kit: CoreKit): Promise<string> {
  const persisted = await kit.hub.call('conciv:navigation:get', {})
  return persisted?.entries[persisted.index]?.href ?? ''
}
