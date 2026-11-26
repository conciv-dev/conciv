import type {HarnessAdapter, HarnessRegistry} from '@conciv/harness'

export function requireHarness(registry: HarnessRegistry, id: string): HarnessAdapter {
  const found = registry.get(id)
  if (found) return found
  const known = registry
    .list()
    .map((adapter) => adapter.id)
    .join(', ')
  throw new Error(`conciv: unknown harness "${id}". Known harnesses: ${known}.`)
}
