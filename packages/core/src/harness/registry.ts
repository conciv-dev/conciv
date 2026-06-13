import type {HarnessAdapter} from '@devgent/protocol/harness-types'
import {claudeAdapter} from './claude/adapter.js'

// The harness registry seam. For now it holds only the inline claude adapter; Plan 2 moves the
// adapters into @devgent/harness and registers them here. External adapters call registerHarness
// against @devgent/protocol's HarnessAdapter contract — they need only @devgent/protocol.
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

// Seed the built-in adapter at module load (no IIFE — a plain call statement).
registerHarness(claudeAdapter)
