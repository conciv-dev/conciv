import type {TestRunnerAdapter} from '@devgent/protocol/runner-types'
import {vitestRunner} from './vitest/adapter.js'

// The runner registry seam — agnostic: it knows nothing about vitest internals, only the
// TestRunnerAdapter contract. For now it holds the inline vitest adapter (from runner/vitest/);
// Plan 3 moves the adapters into @devgent/runner and registers them here. External runners
// call registerRunner against @devgent/protocol's TestRunnerAdapter contract.
const registry = new Map<string, TestRunnerAdapter>()

export function registerRunner(adapter: TestRunnerAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getRunner(id: string): TestRunnerAdapter | undefined {
  return registry.get(id)
}

export function listRunners(): TestRunnerAdapter[] {
  return [...registry.values()]
}

// Seed the built-in runner at module load (no IIFE — a plain call statement).
registerRunner(vitestRunner)
