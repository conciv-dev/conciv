import type {HarnessAdapter} from '@devgent/protocol/harness-types'
import {claudeAdapter} from './claude/adapter.js'

// Holds the inline claude adapter; Plan 2 moves adapters into @devgent/harness.
const registry = new Map<string, HarnessAdapter>()

export function registerHarness(adapter: HarnessAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getHarness(id: string): HarnessAdapter | undefined {
  return registry.get(id)
}

export function listHarnesses(): HarnessAdapter[] {
  return [...registry.values()]
}

registerHarness(claudeAdapter)
