import type {TestRunnerAdapter} from '@devgent/protocol/runner-types'
import {vitestRunner} from './vitest/adapter.js'

// Holds the inline vitest adapter; Plan 3 moves adapters into @devgent/runner.
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

registerRunner(vitestRunner)
