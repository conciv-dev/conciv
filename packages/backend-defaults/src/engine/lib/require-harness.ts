import type {HarnessAdapter, HarnessRegistry} from '@conciv/harness'
import {engineRuntimeErrors} from '@conciv/errors'

export function requireHarness(registry: HarnessRegistry, id: string): HarnessAdapter {
  const found = registry.get(id)
  if (found) return found
  const known = registry
    .list()
    .map((adapter) => adapter.id)
    .join(', ')
  throw engineRuntimeErrors.HARNESS_UNKNOWN({id, known})
}
