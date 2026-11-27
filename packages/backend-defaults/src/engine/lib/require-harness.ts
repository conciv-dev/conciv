import type {HarnessAdapter, HarnessRegistry} from '@conciv/harness'
import {engineErrors} from './errors.js'

export function requireHarness(registry: HarnessRegistry, id: string): HarnessAdapter {
  const found = registry.get(id)
  if (found) return found
  const known = registry
    .list()
    .map((adapter) => adapter.id)
    .join(', ')
  throw engineErrors.HARNESS_UNKNOWN({id, known})
}
