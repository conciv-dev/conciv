import {getHarness, listHarnesses, type HarnessAdapter} from '@conciv/harness'

export function requireHarness(id: string): HarnessAdapter {
  const found = getHarness(id)
  if (found) return found
  const known = listHarnesses()
    .map((adapter) => adapter.id)
    .join(', ')
  throw new Error(`conciv: unknown harness "${id}". Known harnesses: ${known}.`)
}
